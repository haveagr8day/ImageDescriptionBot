# ImageDescriptionBot
An Image Description helper bot for Discord

## Deployment
[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/haveagr8day/ImageDescriptionBot/app.json)

Create a Discord Bot application: https://discordpy.readthedocs.io/en/stable/discord.html

Set bot token provided by Discord as $DISCORD_BOT_TOKEN environment variable wherever you are hosting/running the bot.

Invite bot to desired discord server with the following permissions:

Send Messages, Manage Messages, Embed Links, Attach Files, Read Message History

Additionally, grant "View Channel" for any channels you want to bot to operate in.

Inviting the bot can be done by using the following link with the Client ID provided on the OAuth2 page of your bot application: https://discord.com/api/oauth2/authorize?client_id=[REPLACE_WITH_CLIENT_ID]&permissions=124928&scope=bot

## Usage

![Image posted by user with post text](https://i.imgur.com/WcxoEyK.png)

Detects posts containing image attachment(s) and converts them to bot messages with an image description field. Any text in the original message is preserved at the top of the bot messages.

![Bot converted post](https://i.imgur.com/exUaNpy.png)

The messages contain an identifier (base64 encoded message ID) above the image embed box which can be used to reference the image.

## Adding Image Descriptions
Image descriptions can be set/modified by any user with:

!setimgdesc \<Image ID\> \<Image Description\>

For example:

!setimgdesc C45szN5GACA= Example image written on a grey background

Alternatively, !setimagedesc can also be used in place of !setimgdesc

![Bot image post with updated image description](https://i.imgur.com/9EaCkaA.png)

Errors when processing a !setimgdesc command (e.g. not enough parameters, invalid identifier, etc.) are sent to the user by DM.
