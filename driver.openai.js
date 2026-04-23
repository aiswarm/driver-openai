import OpenAI from 'openai'
import Message from '@aiswarm/orchestrator/message.js'
import AgentDriver from '@aiswarm/orchestrator/agentDriver.js'
import Run from './run.js'

/** @typedef {import('@aiswarm/orchestrator/agentDriver.js').DriverConfig} DriverConfig */
/** @typedef {import('@aiswarm/orchestrator/agentDriver.js').AgentDriverOptions} AgentDriverOptions */

/**
 * @typedef {DriverConfig} OpenAIConfig
 * @property {string} apiKey The API key to use for the OpenAI API.
 * @property {string} model The model to use for the OpenAI API.
 * @property {boolean} keepAssistant Whether to keep the assistant alive after the process exits. By default, its deleted.
 * @property {boolean} keepThread Whether to keep the thread alive after the process exits. By default, its deleted.
 */

const DEFAULT_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo',
  keepAssistant: false,
  keepThread: false
}

/**
 * This is the driver for the OpenAI API.
 * @implements {AgentDriver}
 */
export default class OpenAIDriver extends AgentDriver {
  static type = 'openai'

  #agentConfig
  #driverConfig
  #tools = []
  #api
  #openai
  #agentName
  #assistant
  #thread
  #messageQueue = []
  #messagesProcessing = []
  #run
  #available = false
  /**
   * @param {AgentDriverOptions} options
   * @param {OpenAIConfig} options.driverConfig OpenAI-specific settings (apiKey, model, keepThread, keepAssistant).
   */
  constructor({ api, name, agentConfig, driverConfig }) {
    super()
    this.#api = api
    this.#agentName = name
    this.#agentConfig = agentConfig
    this.#driverConfig = { ...DEFAULT_CONFIG, ...driverConfig }
    this.#openai = new OpenAI({ apiKey: this.#driverConfig.apiKey })
    this.#parseSkillConfig()
    this.#asyncConstructor().catch(api.log.error)
    api.log.debug('Created OpenAI driver for agent', name)
    api.log.trace('OpenAI driver config:', { ...this.#driverConfig, apiKey: '***' })
  }

  /**
   * Runs the asynchronous code of the constructor.
   */
  async #asyncConstructor() {
    const assistantConfig = {
      name: this.#agentName,
      description: this.#agentConfig.description,
      instructions: this.#agentConfig.instructions,
      model: this.#driverConfig.model,
      tools: this.#tools
    }

    this.#assistant = await this.#openai.beta.assistants.create(assistantConfig)
    this.#api.log.debug(
      'Created OpenAI assistant',
      this.#assistant.id,
      'with config',
      assistantConfig
    )
    process.on('exit', async () => await this.#cleanup(this.#assistant))
    process.on('SIGINT', async () => {
      await this.#cleanup()
      process.nextTick(() => process.exit())
    })

    this.#thread = await this.#openai.beta.threads.create()
    this.#available = true

    if (this.#messageQueue.length) {
      process.nextTick(() => this.instruct(this.#messageQueue.shift())) // For some reason the driver thinks it's not available when it is, so we need to wait a tick before instructing
    }
  }

  /**
   * Returns the status of the driver.
   * @return {string} The status of the driver. One of 'idle', 'busy', 'paused', 'error', or 'queued'.
   */
  get status() {
    if (!this.#run) {
      if (this.#messageQueue.length) {
        return 'queued'
      }
      return 'idle'
    }
    if (this.#run.status === 'failed') {
      return 'error'
    }
    if (this.#available) {
      return 'busy'
    }
    return 'paused'
  }

  /**
   * Instructs the agent with the given name.
   * @param {Message} message
   */
  async instruct(message) {
    if (this.#run || !this.#available) {
      this.#messageQueue.push(message)
      message.status = Message.state.queued
      this.#api.log.debug(
        'OpenAI driver for agent',
        this.#agentName,
        'is running, queueing message',
        message.toString()
      )
      return
    }
    message.status = Message.state.processing
    this.#messagesProcessing.push(message)
    this.#run = new Run({
      api: this.#api,
      openai: this.#openai,
      threadId: this.#thread.id,
      assistantId: this.#assistant.id,
      agentName: this.#agentName
    })
    this.#run.on('error', (msg, e) => {
      this.#api.log.error('OpenAI run error', msg, e)
      this.#api.log.debug(e.stack)
      this.#run = null
      message.status = Message.state.error
      this.#messagesProcessing.forEach(message => (message.status = Message.state.error))
      this.#messagesProcessing = []
      if (this.#messageQueue.length) {
        this.instruct(this.#messageQueue.shift())
      }
    })
    this.#run.on('message', message => {
      this.#api.emit('messageUpdated', message)
    })
    this.#run.on('complete', messages => {
      this.#api.log.trace('OpenAI run complete with messages', messages)
      messages.forEach(message => {
        message.status = Message.state.complete
        this.#api.comms.emit(message)
      })
      this.#messagesProcessing.forEach(message => (message.status = Message.state.complete))
      this.#messagesProcessing = []
      this.#run = null
      if (this.#messageQueue.length) {
        this.instruct(this.#messageQueue.shift())
      }
    })
    this.#run.on('cancelled', () => {
      this.#api.log.debug('OpenAI run cancelled')
      this.#messagesProcessing.forEach(message => (message.status = Message.state.cancelled))
      this.#messagesProcessing = []
      this.#run = null
    })

    while (this.#messageQueue.length) {
      const message = this.#messageQueue.shift()
      message.status = Message.state.processing
      this.#messagesProcessing.push(message)
      await this.#run.addMessage(message)
    }
    await this.#run.addMessage(message)
    this.#run.start()
  }

  /**
   * Pauses the driver. This will prevent further runs from being created.
   */
  pause() {
    this.#api.log.debug('Pausing OpenAI driver for agent', this.#agentName)
    this.#available = false
  }

  /**
   * Resumes the driver. This will allow runs to be created again. If there are any queued messages, a run will be created for them.
   */
  resume() {
    this.#api.log.debug('Resuming OpenAI driver for agent', this.#agentName)
    this.#available = true
    if (this.#messageQueue.length) {
      this.instruct(this.#messageQueue.shift())
    }
  }

  remove() {
    this.#cleanup(this.#assistant).catch(this.#api.log.warn)
  }

  /**
   * Cleans up the driver by stopping the run and deleting the thread and assistant.
   */
  async #cleanup() {
    if (this.#run) {
      try {
        await this.#run.stop()
        this.#api.log.debug('Stopped current OpenAI run')
      } catch (e) {
        this.#api.log.error('Failed to stop current OpenAI run', e)
      }
    }

    if (!this.#driverConfig.keepThread) {
      try {
        await this.#openai.beta.threads.delete(this.#thread.id)
        this.#api.log.debug('Deleted OpenAI thread', this.#thread.id)
      } catch (e) {
        this.#api.log.error('Failed to delete OpenAI thread', this.#thread.id, e)
      }
    }

    if (!this.#driverConfig.keepAssistant) {
      try {
        await this.#openai.beta.assistants.delete(this.#assistant.id)
        this.#api.log.debug('Deleted OpenAI assistant', this.#assistant.id)
      } catch (e) {
        this.#api.log.error('Failed to delete OpenAI assistant', this.#assistant.id, e)
      }
    }
    this.#run = null
  }

  #parseSkillConfig() {
    const parsedSkills = []
    for (const skillName of this.#agentConfig.skills ?? []) {
      if (skillName === 'retrieval' || skillName === 'code_interpreter') {
        parsedSkills.push({ type: skillName })
        continue
      }
      const skill = this.#api.skills.get(skillName)
      parsedSkills.push({
        type: 'function',
        function: {
          name: skillName,
          description: skill.description,
          parameters: {
            type: 'object',
            properties: skill.parameters,
            required: skill.required
          }
        }
      })
    }
    this.#tools = parsedSkills
  }
}
