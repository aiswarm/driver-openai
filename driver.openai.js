/**
 * @typedef {import('./api').DriverConfig} OpenAIConfig
 * @property {string} apiKey The API key to use for the OpenAI API.
 */

import OpenAI from 'openai-api'

/**
 * This is the driver for the OpenAI API.
 * @implements {Driver}
 */
export default class OpenAIDriver {
  static #assistants = {};
  #thread;
  #config;
  #openai;
  #api;

  /**
   * Creates a new OpenAI driver.
   * @param {API} api The API object that allows to interact with the system.
   * @param {Agent} agent The agent that will use this driver instance.
   * @param {OpenAIConfig} agent.config The configuration object for this driver.
   */
  constructor(api, agent) {
    this.#api = api
    this.#config = agent.config
    this.#openai = new OpenAI(agent.config.apiKey)
    this.#initialize(agent).catch(api.log.error)
    api.log.info('Created OpenAI driver for agent', agent.name)
    api.log.trace('OpenAI driver config:', agent.config)
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
    return this.#config
  }

  /**
   * Creates the assistant specified by the configuration, or established connection with an existing agent.
   * @param {Agent} agent The agent for which this driver is running.
   */
  async #initialize(agent) {
    // Communication between agents can be done in individual threads, a single shared thread, or any combination of the two. this could allow configuration of complex interactions between agents. For now, we just isolate everyone for simplicity’s sake.
    // if individual thread:
    // Create a new thread for this agent
    // if global thread:
    // if thread doesn't exist create it
    // if group thread:
    // for each group we're member of:
    // {
    // get assistant with name and add to this thread
    // }

    setInterval(() => {
      let id = Date.now()
      this.#api.log.info('Random generated message from the agent nr ' + id)
      this.#api.comms.emit(
        'all',
        agent.name,
        'Random generated message from the agent nr ' + id
      )
    }, 5000)
  }

  /**
   * Gets the assistant with the given name. If it doesn't exist, it will be created.
   * @param {string} name The name of the assistant to get.
   * @param {OpenAIConfig} config The configuration object for this assistant if it needs to be created, otherwise it will be ignored.
   * @return {Promise<Object>} OpenAI assistant object.
   */
  async #getAssistant(name, config) {
    if (!this.#assistants[name]) {
      // TODO: create assistant with name and config
      OpenAIDriver.#assistants[name] = { to: 'do' }
    }
    return OpenAIDriver.#assistants[name]
  }

  /**
   * Instructs the agent with the given name.
   * @param {string|Message} name
   * @param {string} prompt
   * @return {Promise<string>}
   */
  async instruct(name, prompt) {
    if (typeof name == this.#api.comms.Message) {
      console.log('Message', name.toString())
    }
    return 'Stub Response from Driver'
    // TODO: send prompt to this.#thread and return response
    // TODO: instead of a response maybe we should have a streaming response interface. Gotta see when we play with the API.
  }

  pause() {}

  resume() {}
}
