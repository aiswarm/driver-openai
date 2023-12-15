import EventEmitter from 'events'

/**
 * A run is a single conversation with an assistant.
 * @fires Run#error - when an error occurs
 * @fires Run#complete - when the run is complete
 * @fires Run#cancelled - when the run is cancelled
 */
export default class Run extends EventEmitter {
  #api
  #openai
  #threadId
  #assistantId
  #run
  #interval
  #agentName
  #status = 'queued'

  /**
   * Creates a new run
   * @param {API} api The API instance
   * @param {Object} openai The OpenAI instance
   * @param {string} threadId The thread id on which to run
   * @param {string} assistantId The assistant id to use for the run
   * @param {string} agentName The agent name for debugging and messaging
   * @emits Run#error
   * @emits Run#complete
   * @emits Run#cancelled
   * @throws {Error} if the run cannot be created, started, or any other error occurs with the API.
   */
  constructor({api, openai, threadId, assistantId, agentName}) {
    super()
    this.#api = api
    this.#openai = openai
    this.#threadId = threadId
    this.#assistantId = assistantId
    this.#agentName = agentName
  }

  /**
   * The status of the run
   * @type {string}
   */
  get status() {
    return this.#status
  }

  /**
   * Adds a message to a run
   * @param {Message} message
   */
  async addMessage(message) {
    const oaiMessage = await this.#openai.beta.threads.messages.create(this.#threadId, {
      role: 'user',
      content: message.content,
      metadata: {
        source: message.source,
        target: message.target,
        id: message.id,
        timestamp: message.timestamp.getTime(),
        type: message.type.toString()
      }
    })
    this.#api.log.trace('Created OpenAI message', oaiMessage, oaiMessage.content[0].text.value)
  }

  /**
   * Starts the run. Returns when the run is started.
   */
  async start() {
    if (this.#interval) {
      this.#api.log.warn('Run already started')
      return
    }

    this.#run = await this.#openai.beta.threads.runs.create(this.#threadId, {
      assistant_id: this.#assistantId
    })
    this.#api.log.trace('Created OpenAI run', this.#run)

    this.#interval = setInterval(() => this.#poll(), 5000)
  }

  /**
   * Polls the server for the status of the run and handles the result
   * @return {Promise<void>}
   */
  async #poll() {
    try {
      const runResult = await this.#openai.beta.threads.runs.retrieve(this.#threadId, this.#run.id)
      this.#status = runResult.status
      this.#api.log.debug(`OpenAI run ${this.#run.id} for agent ${this.#agentName} is ${runResult.status}`)
      switch (runResult.status) {
      /*
       * case 'queued':
       * case 'in_progress':
       * case 'cancelling':
       */
      case 'requires_action':
        await this.#onActionRequired(runResult)
        break
      case 'cancelled':
        this.#onCancel(runResult)
        break
      case 'expired':
      case 'failed':
        this.#onError(runResult)
        break
      case 'completed':
        await this.#onComplete(runResult)
        break
      }
    } catch (e) {
      this.#onError(e)
    }
  }

  /**
   * Error event.
   * @event Run#error
   * @type {object}
   * @property {string} message - The error message.
   */

  /**
   * Handles an error from the run
   * @param {Object|Error} response
   * @param {Object} [response.last_error]
   * @param {string} [response.last_error.message]
   * @fires Run#error
   */
  #onError(response) {
    clearInterval(this.#interval)
    if (response instanceof Error) {
      this.emit('error', response.message)
    } else if (!response.last_error) {
      this.emit('error', response.last_error.message)
    } else {
      this.emit('error', response)
    }
  }

  /**
   * Complete event.
   * @event Run#complete
   * @type {object}
   * @property {Array} messages - The messages from the run.
   */

  /**
   * Handles the completion of a run
   */
  async #onComplete() {
    clearInterval(this.#interval)
    const messages = await this.#getMessagesFromLastRun()
    this.#api.log.trace('Run result:', messages)
    this.emit('complete', messages)
  }

  /**
   * Gets the messages from the last run.
   * @return {Promise<*[]>}
   */
  async #getMessagesFromLastRun() {
    const messages = []
    const oaiMessages = await this.#openai.beta.threads.messages.list(this.#threadId, {
      limit: 5, // get the last few messages in case the AI generated more than one
      order: 'desc'
    })

    const runCreateAt = this.#run.created_at
    for (const oaiMessage of oaiMessages.data) {
      if (oaiMessage.role === 'user') {
        continue
      }

      if (oaiMessage.created_at < runCreateAt) {
        this.#api.log.trace('Skipping sent message', oaiMessage)
        continue
      }

      for (const content of oaiMessage.content) {
        // TODO parse annotation from openAI text message and convert to html
        messages.push(this.#api.comms.createMessage('user', this.#agentName, content.text.value))
      }
    }
    return messages
  }

  /**
   * Stops the run. Returns when the run is stopped. Indirectly fires the cancel event when the request returns.
   */
  async stop() {
    await this.#openai.beta.threads.runs.cancel(this.#threadId, this.#run.id)
  }

  /**
   * Cancel event.
   * @event Run#cancelled
   * @type {object}
   */

  /**
   * Handles the cancellation of a run.
   * @fires Run#cancelled
   */
  #onCancel() {
    clearInterval(this.#interval)
    this.#api.log.debug('Cancelled OpenAI run', this.#run.id)
    this.emit('cancelled')
  }

  async #onActionRequired(runResult) {
    // TODO handle functions and skills
    this.#api.log.debug('OpenAI run requires action', runResult)
    const toolCalls = runResult.required_action.submit_tool_outputs.tool_calls
    if (toolCalls.length === 0) {
      this.#api.log.warn('OpenAI run requires action but no tool calls found', runResult)
      return
    }

    const tool_outputs = []
    for (const toolCall of toolCalls) {
      this.#api.log.debug('OpenAI run requires action for tool call', toolCall)
      switch (toolCall.type) {
      case 'function':
        tool_outputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify(await this.#handleFunction(toolCall.function))
        })
        break
      default:
        this.#api.log.warn('OpenAI run requires action but tool call type is unknown', toolCall)
      }
    }
    this.#openai.beta.threads.runs.submitToolOutputs(this.#threadId, this.#run.id, {tool_outputs})
    this.#api.log.debug('Submitted tool outputs for OpenAI run', this.#run.id, tool_outputs)
  }

  async #handleFunction(functionProperties) {
    const name = functionProperties.name
    const args = JSON.parse(functionProperties.arguments)
    return await this.#api.skills.execute(name, args, this.#agentName)
  }
}