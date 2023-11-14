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
  #thread
  #config
  #openai
  static #assistants = {}

  /**
   * Creates a new OpenAI driver.
   * @param {API} api The API object that allows to interact with the system.
   * @param {string} name The name of the agent to create the driver for.
   * @param {OpenAIConfig} config The configuration object for this driver.
   */
  constructor(api, config, name) {
    this.#config = config
    this.#openai = new OpenAI(config.apiKey)
    this.#initialize(name).catch(api.log.error)
    api.log.info('Created OpenAI driver for agent', name)
    api.log.trace('OpenAI driver config:', config)
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
   */
  async #initialize(name) {
    // Communication between agents can be done in individual threads, a single shared thread, or any combination of the two. this could allow configuration of complex interactions between agents. For now we just isolate everyone for simplicity sake.

    // if individual thread:
    // Create a new thread for this agent
    // if global thread:
    // if thread doesn't exist create it
    // if group thread:
    // for each group we're memeber of:
    // {
    // get assistant with name and add to this thread
    // }
  }

  /**
   * Gets the assistant with the given name. If it doesn't exist, it will be created.
   * @param {string} name The name of the assistant to get.
   * @param {OpenAIConfig} config The configuration object for this assistant if it needs to be created, otherwise it will be ignored.
   * @return {Promise<OpenAI.Assistant>}
   */
  async #getAssistant(name, config) {
    if (!this.#assistants[name]) {
      // TODO: create assistant with name and config
      OpenAIDriver.#assistants[name] = {to:'do'};
    }
    return OpenAIDriver.#assistants[name];
  }

  async instruct(prompt) {
    // TODO: send prompt to this.#thread and return response
    // TODO: instead of a response maybe we should have a streaming response interface. Gotta see when we play with the API.
  }
}