// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler } = require('botbuilder');

const { LuisHelper } = require('./luisHelper');

class MainBot extends ActivityHandler {
    constructor() {
        super();

        this.onMessage(async (context, next) => {
            await LuisHelper.executeLuisQuery(console, context);

            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }
}

module.exports.MainBot = MainBot;
