# ImageDescriptionBot
## Summary
An Image Description helper bot for Discord

![Image posted by user with post text](https://i.imgur.com/WcxoEyK.png)

Detects posts containing image attachment(s) and converts them to bot messages with an image description field. Any text in the original message is preserved at the top of the bot messages.

![Bot converted post](https://i.imgur.com/exUaNpy.png)

The messages contain an identifier (base64 encoded message ID) above the image embed box which can be used to reference the image.

## Adding Image Descriptions
Image descriptions can be set/modified by any user with:

!setimgdesc \<Image ID\> \<Image Description\>

For example:

!setimgdesc C45szN5GACA= Example image written on a grey background

![Bot image post with updated image description](https://i.imgur.com/9EaCkaA.png)

Errors when processing a !setimgdesc command (e.g. not enough parameters, invalid identifier, etc.) are sent to the user by DM.
