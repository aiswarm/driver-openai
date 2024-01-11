import OpenAI from 'openai'
import Run from './run.js'

/**
 * @typedef {import('./api').DriverConfig} OpenAIConfig
 * @property {string} apiKey The API key to use for the OpenAI API.
 * @property {string} model The model to use for the OpenAI API.
 * @property {boolean} keepAssistant Whether to keep the assistant alive after the process exits. By default, its deleted.
 * @property {boolean} keepThread Whether to keep the thread alive after the process exits. By default, its deleted.
 */

const DEFAULT_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-1106-preview',
  keepAssistant: false,
  keepThread: false
}

/**
 * This is the driver for the OpenAI API.
 * @implements {AgentDriver}
 */
export default class OpenAIDriver {
  #config
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
   * Creates a new OpenAI driver.
   * @param {API} api The API object that allows to interact with the system.
   * @param {string} name The name of the agent for which this driver is running.
   * @param {AgentConfig} config The configuration object for this driver.
   * @param {OpenAIConfig} config.driver The configuration object specific to OpenAI.
   * @param {string} instructions The initial set of instructions to use for the assistant.
   */
  constructor({api, name, config, instructions}) {
    this.#api = api
    this.#agentName = name
    this.#config = config
    this.#config.driver = {...DEFAULT_CONFIG, ...config.driver}
    this.#openai = new OpenAI({apiKey: config.driver.apiKey})
    this.#parseSkillConfig()
    this.#asyncConstructor(api, name, config, instructions).catch(api.log.error)
    api.log.debug('Created OpenAI driver for agent', name)
    api.log.trace('OpenAI driver config:', {...config.driver, apiKey: '***'})
  }

  /**
   * Runs the asynchronous code of the constructor
   * @param {API} api
   * @param {string} name
   * @param {AgentConfig} config
   * @param {OpenAIConfig} config.driver
   */
  async #asyncConstructor(api, name, config) {
    const assistantConfig = {
      name,
      description: config.description,
      instructions: config.instructions,
      model: config.driver.model,
      tools: config.driver.skills
    }

    this.#assistant = await this.#openai.beta.assistants.create(assistantConfig)
    this.#api.log.debug('Created OpenAI assistant', this.#assistant.id, 'with config', assistantConfig)
    process.on('exit', () => this.#cleanup(this.#assistant))

    this.#thread = await this.#openai.beta.threads.create()
    this.#available = true

    if (this.#messageQueue.length) {
      process.nextTick(() => this.instruct(this.#messageQueue.shift())) // For some reason the driver thinks it's not available when it is, so we need to wait a tick before instructing
    }
  }

  /**
   * Returns the type of the driver which is 'openai'.
   * @override
   * @return {string}
   */
  get type() {
    return 'openai'
  }

  /**
   * Returns the configuration object for this driver.
   * @return {OpenAIConfig}
   */
  get config() {
    return this.#config.driver
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
      message.status = 'queued'
      this.#api.log.debug('OpenAI driver for agent', this.#agentName, 'is running, queueing message', message.toString())
      return
    }
    message.status = 'processing'
    this.#run = new Run({
      api: this.#api,
      openai: this.#openai,
      threadId: this.#thread.id,
      assistantId: this.#assistant.id,
      agentName: this.#agentName
    })
    this.#run.on('error', e => {
      this.#api.log.error('OpenAI run error', e)
      this.#api.log.debug(e.stack)
      this.#run = null
      message.status = 'error'
      if (this.#messageQueue.length) {
        this.instruct(this.#messageQueue.shift())
      }
    })
    this.#run.on('complete', messages => {
      this.#api.log.trace('OpenAI run complete with messages', messages)
      messages.forEach(message => {
        message.status = 'sent'
        this.#api.comms.emit(message)
      })
      this.#messagesProcessing.forEach(message => message.status = 'received')
      this.#messagesProcessing = []
      this.#run = null
      if (this.#messageQueue.length) {
        this.instruct(this.#messageQueue.shift())
      }
    })
    this.#run.on('cancelled', () => {
      this.#api.log.debug('OpenAI run cancelled')
      this.#run = null
    })

    while (this.#messageQueue.length) {
      const message = this.#messageQueue.shift()
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
   * @param {Object} assistant The assistant object from the OpenAI API
   * @param {string} assistant.id The id of the assistant
   */
  async #cleanup(assistant) {
    if (this.#run) {
      try {
        this.#run.stop()
        this.#api.log.debug('Stopped OpenAI run', this.#run.id)
      } catch (e) {
        this.#api.log.error('Failed to stop OpenAI run', this.#run.id, e)
      }
    }

    if (!this.#config.driver.keepThread) {
      try {
        this.#openai.beta.threads.del(this.#thread.id)
        this.#api.log.debug('Deleted OpenAI thread', this.#thread.id)
      } catch (e) {
        this.#api.log.error('Failed to delete OpenAI thread', this.#thread.id, e)
      }
    }

    if (!this.#config.driver.keepAssistant) {
      try {
        this.#openai.beta.assistants.del(assistant.id)
        this.#api.log.debug('Deleted OpenAI assistant', assistant.id)
      } catch (e) {
        this.#api.log.error('Failed to delete OpenAI assistant', assistant.id, e)
      }
    }
  }

  #parseSkillConfig() {
    const parsedSkills = []
    for (const skillName of this.#config.skills) {
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
    this.#config.driver.skills = parsedSkills
  }
}