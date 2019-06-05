// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { LuisRecognizer } = require('botbuilder-ai');
const Lifx = require('lifx-http-api');

const constants = require('./constants');

let lifxClient;

// let isCycleEffectEnabled = false;
// let isCycleEffectRunning = false;

class LuisHelper {
    /**
   * Returns an object with preformatted LUIS results for the bot's dialogs to consume.
   * @param {*} console
   * @param {TurnContext} context
   */
    static async executeLuisQuery(console, context) {
        let result = {};

        const lifxOptions = { bearerToken: process.env.LifxApiKey };
        lifxClient = new Lifx(lifxOptions);

        try {
            const luisApplication = {
                applicationId: process.env.LuisAppId,
                endpointKey: process.env.LuisAPIKey,
                endpoint: `https://${ process.env.LuisAPIHostName }`
            };
            const luisPredictionOptions = {
                includeAllIntents: true,
                log: true,
                staging: false
            };

            const recognizer = new LuisRecognizer(
                luisApplication,
                luisPredictionOptions,
                true
            );

            const recognizerResult = await recognizer.recognize(context);

            const intent = LuisRecognizer.topIntent(recognizerResult);

            result = recognizerResult;

            if (intent === 'Lights') {
                console.log('Made it!');
                console.dir(recognizerResult);

                let lightState;

                let location = this.parseEntity(
                    recognizerResult.luisResult.entities,
                    constants.entities.LIGHT_KEY
                );
                const color = this.parseEntity(
                    recognizerResult.luisResult.entities,
                    constants.entities.COLOR_KEY
                )[0];
                const colorEntities = recognizerResult.luisResult.entities.filter(
                    entity => entity.type === constants.entities.COLOR_KEY
                );
                const effectType = this.parseEntity(
                    recognizerResult.luisResult.entities,
                    constants.entities.EFFECT_TYPE_KEY
                );
                const effectState = this.parseEntity(
                    recognizerResult.luisResult.entities,
                    constants.entities.EFFECT_STATE_KEY
                );

                if (!color || colorEntities.length === 0) {
                    lightState = this.parseEntity(
                        recognizerResult.luisResult.entities,
                        constants.entities.STATE_KEY
                    );
                } else {
                    lightState = {
                        entity: 'on',
                        type: 'state',
                        startIndex: 0,
                        endIndex: 1,
                        score: 100
                    };
                    if (!location) {
                        location = {
                            entity: 'light'
                        };
                    }
                }

                if (location && lightState && colorEntities.length < 2) {
                    // we call LIFX
                    this.controlLights(
                        context,
                        location.entity,
                        lightState.entity,
                        color && color.entity
                    );
                } else if (effectType) {
                    this.triggerLightEffect(
                        context,
                        effectType.entity,
                        colorEntities,
                        effectState && effectState.entity
                    );
                } else {
                    //   session.send(constants.messages.LIGHT_COMMAND_NOT_UNDERSTOOD);
                    //   session.endDialog();
                }
            }
        } catch (err) {
            console.warn(`LUIS Exception: ${ err } Check your LUIS configuration`);
        }
        return result;
    }

    static parseEntity(entities, entityName) {
        const entityValue = entities.filter(entity => entity.type === entityName);
        if (!entityValue || !entityValue[0]) return undefined;
        return entityValue;
    }

    static triggerLightEffect(context, effect, colorEntities, effectState) {
        console.log('info', constants.logs.RAW_EFFECT_RECEIVED(effect));
        const message = constants.logs.INITIATED_EFFECT(effect);
        const period = parseFloat(process.env.LifxEffectPeriod);
        const cycles = parseFloat(process.env.LifxEffectCycles);
        if (effect === constants.effectTypes.PULSE && colorEntities.length > 1) {
            const pulseOptions = {
                color: colorEntities[1].entity,
                from_color: colorEntities[0].entity,
                power_on: true,
                period,
                cycles
            };
            const restartLightCycle = this.shouldRestartLightCycle();
            this.initiatePulseEffect(pulseOptions, context, restartLightCycle);
        } else if (effect === constants.effectTypes.CYCLE) {
            this.toggleCycleEffect(context, effectState);
        } else {
            // Not a defined effect so do nothing
            const warningMessage = constants.logs.UNSUPPORTED_EFFECT(effect);
            console.log('warn', warningMessage);
            console.log('warn', constants.logs.FULL_MESSAGE_RECEIVED(message));
            console.log('info', constants.logs.NO_EFFECT_INITIATED);
            // context.send(warningMessage);
            // context.endDialog();
        }
    }

    static initiatePulseEffect(pulseOptions, context, restartLightCycle) {
        console.log('info', constants.logs.INITIATING_PULSE_EFFECT);
        lifxClient
            .pulse(constants.LIFX_DEVICE_TO_USE, pulseOptions)
            .then(result => {
                // context.send(result);
                // context.send(
                //     `Successfully triggered the special effect on the LIFX light`
                // );
                // context.endDialog();

                if (restartLightCycle) {
                    this.toggleCycleEffect(context);
                }
            })
            .catch(error => {
                console.log('error', error);
                // context.send(`There was an error initiating the effect: ${ error }`);
                // context.endDialog();

                if (restartLightCycle) {
                    this.toggleCycleEffect(context);
                }
            });
    }

    static toggleCycleEffect(context, effectState) {
        this.isCycleEffectEnabled = this.determineEffectState(effectState);
        if (this.isCycleEffectEnabled && !this.isCycleEffectRunning) {
            console.log('info', constants.logs.INITIATING_CYCLE_EFFECT);
            // context.send(constants.logs.INITIATING_CYCLE_EFFECT);
            this.setLifxLights(
                { power: 'on', color: 'blue' },
                'Start of color cycle: blue',
                context
            );
            this.isCycleEffectRunning = true;
            const cycleEffectInterval = setInterval(() => {
                if (!this.isCycleEffectEnabled) {
                    clearInterval(cycleEffectInterval);
                    this.isCycleEffectRunning = false;
                    // context.send('Cycle effect has stopped running');
                } else {
                    this.cycleLightColor(context);
                }
            }, 6000);
        } else if (!this.isCycleEffectEnabled) {
            this.isCycleEffectRunning = false;
            // context.send('Cycle effect is disabled');
        } else {
            // context.send('Cycle effect is already enabled and running');
        }
    }

    static cycleLightColor(context) {
        lifxClient
            .setDelta(constants.LIFX_DEVICE_TO_USE, constants.lifxCycleEffectDefaults)
            .then(result => {
                console.log('info', result);
                // context.send('Rotated the light color by 60 degrees');
            })
            .catch(error => {
                console.log('error', error);
                // context.send(`There was an error initiating the effect: ${ error }`);
                // context.endDialog();
            });
    }

    static determineEffectState(effectState) {
        switch (effectState) {
        case 'off':
        case 'disable':
        case 'stop':
        case 'end':
        case 'disabled':
            return false;
        default:
            return true;
        }
    }

    static controlLights(context, location, lightState, color) {
        let message = `The ${ location } was turned ${ lightState }`;
        console.log('info', color);

        const stateToSet = {
            power: `${ lightState }`,
            duration: 0.5
        };
        if (color) {
            stateToSet.color = `${ color }`;
            message += ` and was set to ${ color }`;
        }
        const restartLightCycle = this.shouldRestartLightCycle();
        this.setLifxLights(stateToSet, message, context, restartLightCycle);
    }

    static shouldRestartLightCycle() {
        let restartLightCycle = false;
        if (this.isCycleEffectRunning) {
            this.isCycleEffectEnabled = false;
            this.isCycleEffectRunning = false;
            restartLightCycle = true;
        } else {
            restartLightCycle = false;
        }
        return restartLightCycle;
    }

    static setLifxLights(stateToSet, message, context, restartLightCycle) {
        lifxClient
            .setState(constants.LIFX_DEVICE_TO_USE, stateToSet)
            .then(result => {
                // context.send(result);
                // context.send(message);
                // context.endDialog();

                // TODO: make the timeout time value more dynamic
                setTimeout(() => {
                    if (restartLightCycle) {
                        this.toggleCycleEffect(context);
                    }
                }, 30000);
            })
            .catch(error => {
                console.log('error', error);
                // context.send(`There was an error initiating the effect: ${ error }`);
                // context.endDialog();

                // TODO: make the timeout time value more dynamic
                setTimeout(() => {
                    if (restartLightCycle) {
                        this.toggleCycleEffect(context);
                    }
                }, 30000);
            });
    }
}

module.exports.LuisHelper = LuisHelper;
