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
    #config;
    #openai;

    /**
     * Creates a new OpenAI driver.
     * @param {OpenAIConfig} config
     */
    constructor(config) {
        this.#config = config
        this.#openai = new OpenAI(config.apiKey)
    }

    /**
     * Returns the type of the driver which is 'openai'.
     * @override
     * @return {string}
     */
    get type() {
        return 'openai'
    }

    async instruct(prompt) {
        return this.#openai.complete({
            engine: this.#config.engine,
            prompt: prompt,
            maxTokens: this.#config.maxTokens,
            temperature: this.#config.temperature,
            topP: this.#config.topP,
            presencePenalty: this.#config.presencePenalty,
            frequencyPenalty: this.#config.frequencyPenalty,
            bestOf: this.#config.bestOf,
            n: this.#config.n,
            stream: false,
            stop: ['\n', "Human:", "AI:"]
        })
    }
}