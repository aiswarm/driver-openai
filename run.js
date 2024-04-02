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
  #stream
  #runId
  #agentName
  #status = 'queued'
  #messages = []

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
    let messagePrefix = ''
    if (message.source !== 'user') {
      messagePrefix = `From ${message.source}: `
    }
    const oaiMessage = await this.#openai.beta.threads.messages.create(this.#threadId, {
      role: 'user',
      content: messagePrefix + message.content,
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

  async start() {
    this.#stream = await this.#openai.beta.threads.runs.create(this.#threadId, {
      assistant_id: this.#assistantId,
      stream: true
    })

    await this.#process()
  }

  async #process() {
    let currentMessage
    for await (const payload of this.#stream) {
      switch(payload.event) {
      case 'thread.run.created':
        this.#runId = payload.data.id
        break
      case 'thread.run.queued':
      case 'thread.run.in_progress':
      case 'thread.run.cancelling':
      case 'thread.run.step.created':
      case 'thread.run.step.in_progress':
      case 'thread.run.step.delta':
      case 'thread.run.step.completed':
      case 'thread.run.step.failed':
      case 'thread.run.step.cancelled':
      case 'thread.run.step.expired':
      case 'thread.message.incomplete':
      case 'thread.message.in_progress':
        this.#api.log.trace('Unhandled/Ignored Streaming Event: ', payload.event)
        break
      case 'thread.run.completed':
        await this.#onComplete()
        break
      case 'thread.run.cancelled':
        this.#onCancel()
        break
      case 'thread.message.created':
        currentMessage = this.#api.comms.createMessage('user', this.#agentName, '')
        this.#messages.push(currentMessage)
        break
      case 'thread.message.delta':
        if (payload.data.delta.content.length > 1) {
          this.#api.log.warn('Unexpected content length', payload.data.delta.content)
        }
        if (!currentMessage) {
          this.#api.log.error('Received message delta without a message')
          break
        }
        currentMessage.append(payload.data.delta.content[0].text.value)
        break
      case 'thread.message.completed':
        currentMessage = null
        break
      case 'thread.run.requires_action':
        await this.#onActionRequired(payload.data)
        break
      case 'thread.run.failed':
      case 'thread.run.expired':
      case 'error':
        this.#onError(payload.data)
        return
      case 'end':
        await this.#onComplete()
        return
      default:
        console.log('Event: ', payload)
      }
    }
  }

  async stop() {
    await this.#openai.beta.threads.runs.cancel(this.#threadId, this.#runId)
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
    if (response instanceof Error) {
      this.emit('error', response.message, response)
    } else if (response.last_error) {
      this.emit('error', response.last_error.message, response)
    } else {
      this.emit('error', response, response)
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
    this.#api.log.trace('Run result:', this.#messages)
    this.emit('complete', this.#messages)
    this.#messages = []
  }

  #onCancel() {
    this.#api.log.debug('Cancelled current OpenAI run')
    this.emit('cancelled')
  }

  async #onActionRequired(runResult) {
    if (runResult.required_action.type !== 'submit_tool_outputs') {
      this.#api.log.debug('OpenAI run requires action but action type is unknown', runResult)
      return
    }
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
    this.#stream = this.#openai.beta.threads.runs.submitToolOutputsStream(this.#threadId, runResult.id, {tool_outputs})
    this.#api.log.debug('Submitted tool outputs for OpenAI run', runResult.id, tool_outputs)
    await this.#process()
  }


  async #handleFunction(functionProperties) {
    const name = functionProperties.name
    const args = JSON.parse(functionProperties.arguments)
    try {
      return await this.#api.skills.execute(name, args, this.#agentName)
    } catch (e) {
      return {
        error: e.message
      }
    }
  }
}