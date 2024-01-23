[![npm version](https://badge.fury.io/js/%40aiswarm%2Fdriver-openai.svg)](https://badge.fury.io/js/%40aiswarm%2Fdriver-openai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Downloads](https://img.shields.io/npm/dm/%40aiswarm%2Fdriver-openai.svg)](https://npmjs.com/package/%40aiswarm%2Fdriver-openai)
[![Issues](https://img.shields.io/github/issues-raw/aiswarm/driver-openai)](https://github.com/aiswarm/driver-openai/issues)
[![Known Vulnerabilities](https://snyk.io/test/github/aiswarm/driver-openai/badge.svg)](https://snyk.io/test/github/aiswarm/driver-openai)

# AI Swarm - Driver OpenAI

This is a driver for the AI Swarm that uses the [OpenAI](https://openai.com/) API to provide a LLM for the AI Swarm. It handles all communication with any agents running in the swarm using the OpenAI API. The driver does not run on its own, it must be used with the [Orchestrator](https://github.com/aiswarm/orchestrator). 

If you're looking for an easy way to get started with the AI Swarm, check out the [Conductor](https://github.com/aiswarm/conductor) project.

## Project setup for development

```
npm install
```

## Recommended Setup for development with other plugins

You will need to link the plugin to the other plugins you want to use. So that you can make changes and see them immediately without having to publish the plugin to npm.

For this I recommend you create a new folder for the AI Swarm and clone all the plugins you want to use into it. Then link them together.

Each plugin has `link` script defined in the `package.json` file if there are dependencies on other packages.
You can run it with `npm run link` to link your code directly when you make changes.

This project does not have any dependencies on other plugins, so you don't need to link anything.