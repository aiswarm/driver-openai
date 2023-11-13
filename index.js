import OpenAIDriver from './driver.openai.js'

export function initialize(api) {
    api.log.info('Initializing OpenAI plugin.')
    api.registerAgentDriver('openai', OpenAIDriver)
}