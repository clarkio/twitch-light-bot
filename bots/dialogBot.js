// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler } = require('botbuilder');

const { LuisHelper } = require('./luisHelper');

class DialogBot extends ActivityHandler {
    constructor() {
        super();

        this.onMessage(async (context, next) => {
            await LuisHelper.executeLuisQuery(console, context);

            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }
}

module.exports.DialogBot = DialogBot;
