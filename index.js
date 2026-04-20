import OpenAIDriver from './driver.openai.js'

export function initialize(api) {
  api.registerAgentDriver(OpenAIDriver)
}
