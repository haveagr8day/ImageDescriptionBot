// Log exceptions
process.on('uncaughtException', function (exception) {
    console.log(exception);
});

// Helper functions for b64<->int conversion
function atob(b64) {
  return Buffer.from(b64, 'base64').toString('binary');
}

function b64tonum(b64) {
  var bin = atob(b64);
  var hex = [];

  bin.split('').forEach(function (ch) {
    var h = ch.charCodeAt(0).toString(16);
    if (h.length % 2) { h = '0' + h; }
    hex.push(h);
  });

  return BigInt('0x' + hex.join(''));
}

function btoa(bin) {
  return Buffer.from(bin, 'binary').toString('base64');
}

function numtob64(bn) {
  var hex = BigInt(bn).toString(16);
  if (hex.length % 2) { hex = '0' + hex; }

  var bin = [];
  var i = 0;
  var d;
  var b;
  while (i < hex.length) {
    d = parseInt(hex.slice(i, i + 2), 16);
    b = String.fromCharCode(d);
    bin.push(b);
    i += 2;
  }

  return btoa(bin.join(''));
}

console.log('Starting bot')

const Discord = require('discord.js');
const https = require('https');
const fs = require('fs');
const fsPromises = fs.promises;

const bot = new Discord.Client({ partials: ['MESSAGE', 'REACTION'] });

var timerDict = {};

// Log when connection succeeeds
bot.on('ready', function(evt) {
    console.log('Connected');
    console.log('Logged in as: ');
    console.log(bot.user.tag);
});

// Main bot code
bot.on('message', async function (message) {
    console.log(`on message: ${message.id}`)
    if (message.partial){
        try{
            await message.fetch();
        } catch(err){
            return;
        }
    }
    if (!message.author){
        console.log("Ignoring message with no author")
        return;
    }
    //console.log(JSON.stringify(message,null,4))

    // Ignore bot messages
    if(message.author.tag == bot.user.tag) {
        return;
    }
    console.log(`Processing message ${message.id}`);

    handleAttachments(message);
    handleEmbeds(message);
    handleCommands(message);
});

bot.on('messageUpdate', async (oldMessage, newMessage) => {
    console.log(`on messageUpdate: ${newMessage.id}`)
    if (newMessage.partial){
        try{
            await newMessage.fetch();
        } catch(err){
            return;
        }
    }
    if (!newMessage.author){
        console.log("Ignoring message with no author")
        return;
    }
    //console.log(JSON.stringify(newMessage,null,4))
    // Ignore bot messages
    if(newMessage.author.tag == bot.user.tag) {
        return;
    }
    console.log(`Processing update for message ${newMessage.id}`);
    handleEmbeds(newMessage);
});

bot.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    var message = reaction.message;

    // Ignore reactions to non-bot messages
    if(message.author.tag != bot.user.tag) {
        return;
    }

    // Ignore reactions from bot
    if(user.tag == bot.user.tag) {
        return;
    }

    // Ignore reactions in channels with non-image bot posts
    if(message.channel.name === 'idb-audit-logs') {
        return;
    }

    if (message.channel.name === 'id-needed') {
        if(reaction.emoji.name == '✅'){
            const role = message.guild.roles.cache.find(role => role.name === 'Image Description Volunteers');
            if(role){
                if(message.guild.members.resolve(user.id).roles.cache.has(role.id)){
                    message.delete();
                }
                else{
                    reaction.users.remove(user);
                }
            }
            else{
                message.delete();
            }
        }
    }
    else{
        if(reaction.emoji.name == '🗑'){
            if (message.embeds.length == 0){
                return;
            }
            var embedMsg = message.embeds[0];

            // Delete wastebin react if from non-owner and ignore
            if (embedMsg.fields[0].value != `<@!${user.id}>`){
                reaction.users.remove(user);
                return;
            }

            console.log('Sending delete confirmation message')
            message.channel.send(`<@!${user.id}> click ✅ to confirm deleting your post, or ❌ to cancel. Deletion will automatically cancel after 60 seconds if no response is received.`)
            .then( async(confirmMsg) => {
                const filter = (reaction, confirmUser) => (reaction.emoji.name === '❌' || reaction.emoji.name ==='✅') && user.id === confirmUser.id
                confirmMsg.awaitReactions(filter, {max:1, time:60000, errors: ['time']})
                .then(collected => {
                    const confirmReaction = collected.first();

                    if (confirmReaction.emoji.name === '❌') {
                        console.log('Cancelled deletion')
                        confirmMsg.delete();
                        reaction.users.remove(user);
                        return;
                    }

                    if (confirmReaction.emoji.name === '✅') {
                        console.log('Deleting post by request of owner')
                        confirmMsg.delete()

                        // Cancel ID request timer
                        var b64id = numtob64(message.id);
                        if(b64id in timerDict) {
                            clearTimeout(timerDict[b64id]);
                            delete timerDict[b64id];
                        }

                        var auditLogChannel = message.guild.channels.cache.find(channel => channel.name === 'idb-audit-logs');
                        if (auditLogChannel){
                            console.log("Posting audit log entry")
                            const auditEmbedMsg = new Discord.MessageEmbed()
                                .addField('Log Type','Post deleted by owner')
                                .addField('Post Owner:',`<@!${user.id}>`)
                                .addField('Channel:',`<#${message.channel.id}>`)
                                .addField('Post Text:',`${embedMsg.description}`)
                                .addField('Image Description:',`${embedMsg.fields[1].value}`)
                                .addField('Image Description Author:',`${embedMsg.fields[2].value}`)
                            auditLogChannel.send(auditEmbedMsg)
                        }

                        message.delete();
                        
                        if(embedMsg.footer){
                            message.channel.messages.cache.get(embedMsg.footer.text).delete();
                        }
                        return;
                    }
                })
                .catch(collected => {
                    console.log(collected);
                    console.log('Auto-cancelled deletion (timed out)')
                    confirmMsg.delete();
                    reaction.users.remove(user);
                    return;
                });
                try{
                    await confirmMsg.react('✅');
                    await confirmMsg.react('❌');
                }
                catch(err) {}
            });
        }
    }
});

function handleAttachments(message) {
    var messageContent = message.content;

    if(message.channel.name === 'idb-audit-logs') {
        console.log('Ignoring attachment check for message in #idb-audit-logs')
        return;
    }

    if(message.channel.name === 'id-needed') {
        console.log('Ignoring attachment check for message in #id-needed')
        return;
    }

    if (message.attachments.size > 0) {
        console.log(`Message has ${message.attachments.size} attachment(s)`);
        if (message.attachments.every(attachmentIsImage)) {
            console.log('All attachments are images');
            var successCount = 0;
            var attachmentCount = message.attachments.size;
            message.attachments.forEach( function (img) {
                console.log('Downloading image');
                const filename = img.url.split('/').pop();
                fsPromises.unlink(filename)
                .catch( function (error) {})
                .finally( function() {
                    try{
                        console.log(img.url);
                        var file = fs.createWriteStream(filename);
                        var request = https.get(img.url, function(response) {
                            if (response.statusCode != 200){
                                console.log(`Error: Got ${response.statusCode} while downloading image`);
                                return;
                            }
                            response.pipe(file);
                            // Download complete
                            file.on('finish', function() {
                                // File write complete
                                file.close(function (err) {
                                    if(err) throw err;
                                    console.log('Uploading image to initial message')
                                    const embedMsg = new Discord.MessageEmbed()
                                        .setTitle('Processing, please wait')
                                        .attachFiles([`./${filename}`])
                                        .setImage(`attachment://${filename}`);
                                    message.channel.send(embedMsg)
                                    .then( function (sent) {
                                        fsPromises.unlink(filename);
                                        console.log(sent.id);
                                        var id64 = numtob64(sent.id);
                                        console.log(id64);
                                        console.log('Updating message with id and fields');
                                        const embedMsg = new Discord.MessageEmbed()
                                            .addField('Posted By:',`<@!${message.author.id}>`)
                                            .setDescription(messageContent)
                                            .addField('Image Description:', 'Description not yet set.\n\nTo set an image description send:\n!setimgdesc <picture ID> <image description>\n\nExample:\n!setimgdesc C41LumcAAAA= A chipmunk eating from someone\'s hand.')
                                            .addField('Image Description Written By:', 'Nobody')
                                            .setImage(`attachment://${filename}`);
                                        sent.edit(embedMsg)
                                        .then( function (doneEmbed) {
                                            doneEmbed.edit({ content: `${id64}`, embed: embedMsg })
                                            .then( function (doneMsg) {
                                                successCount++;
                                                doneMsg.react("🗑")
                                                    .catch(error => console.log(error));
                                                var notifChannel = message.guild.channels.cache.find(channel => channel.name === 'id-needed');
                                                if (notifChannel){
                                                    console.log("Starting notification timer")
                                                    var postURL = doneMsg.url;
                                                    var postChannelName = message.channel.name;
                                                    var postMessageID = id64;
                                                    var imageURL = doneMsg.embeds[0].image.url;
                                                    timerDict[id64] = setTimeout((postURL, postChannelName, notifChannel, imageURL) => {
                                                        console.log("Sending ID needed message")
                                                        const embedMsg = new Discord.MessageEmbed()
                                                            .setTitle(`Image Description needed in #${postChannelName}`)
                                                            .addField('Image Post Link', postURL)
                                                            .setImage(imageURL);
                                                        const role = notifChannel.guild.roles.cache.find(role => role.name === 'Image Description Volunteers');
                                                        if (role){
                                                            notifChannel.send(`<@&${role.id}>`, { "embed":embedMsg, "allowedMentions": { "roles":[role.id] } })
                                                            .then (notifMsg => {
                                                                notifMsg.react('✅')
                                                            });
                                                        }
                                                        else{
                                                            notifChannel.send(embedMsg)
                                                            .then (notifMsg => {
                                                                notifMsg.react('✅')
                                                            });
                                                        }
                                                    }, 300000, postURL, postChannelName, notifChannel, imageURL);
                                                }
                                                if(successCount == attachmentCount){
                                                    console.log('Deleting user image post');
                                                    message.delete();
                                                }
                                            });
                                        });
                                    });
                                });
                            });
                        // Download error
                        }).on('error', function(err) {
                            file.close();
                            fsPromises.unlink(dest); // Delete the file
                            console.log(`Error while fetching image: ${err}`)
                        });
                    }
                    catch (err) {
                        console.log(`Error: Unknown processing error ${err}`);
                    }
                });
            });
        }
    }
    else {
        console.log('No attachment found')
    }
}

function handleEmbeds(message) {
    var messageContent = message.content;

    if(message.channel.name === 'idb-audit-logs') {
        console.log('Ignoring embed checks for message in #idb-audit-logs')
        return;
    }

    if(message.channel.name === 'id-needed') {
        console.log('Ignoring embed checks for message in #id-needed')
        return;
    }

    if (message.embeds.length > 0) {
        console.log(`Message has ${message.embeds.length} embed(s)`);
        if (message.embeds.every( embed => { return embed.type == 'image' || embed.type == 'gifv' })) {
            console.log('All embeds are images');
            var successCount = 0;
            var embedCount = message.embeds.length;
            message.embeds.forEach( function (embed) {               
                console.log('Uploading image to initial message')
                const embedMsg = new Discord.MessageEmbed()
                    .setTitle('Processing, please wait');  
                message.channel.send(embedMsg)
                .then( function (sent) {
                    console.log(sent.id);
                    var id64 = numtob64(sent.id);
                    console.log(id64);
                    message.channel.send({
                        "content": embed.url,
                        "embeds":
                        [{
                            "type": embed.type,
                            "url": embed.url
                        }]
                    })
                    .then( (imgSent) => {
                        console.log('Updating message with id and fields');
                        const embedMsg = new Discord.MessageEmbed()
                        .addField('Posted By:',`<@!${message.author.id}>`)
                        .setDescription(messageContent.replace(embed.url,''))
                        .addField('Image Description:', 'Description not yet set.\n\nTo set an image description send:\n!setimgdesc <picture ID> <image description>\n\nExample:\n!setimgdesc C41LumcAAAA= A chipmunk eating from someone\'s hand.')
                        .addField('Image Description Written By:', 'Nobody')
                        .setFooter(imgSent.id);
                        sent.edit(embedMsg)
                        .then( function (doneEmbed) {
                            doneEmbed.edit({ content: `${id64}`, embed: embedMsg })
                            .then( function (doneMsg) {
                                successCount++;
                                doneMsg.react("🗑")
                                    .catch(error => console.log(error));
                                var notifChannel = message.guild.channels.cache.find(channel => channel.name === 'id-needed');
                                if (notifChannel){
                                    console.log("Starting notification timer")
                                    var postURL = doneMsg.url;
                                    var postChannelName = message.channel.name;
                                    var postMessageID = id64;
                                    timerDict[id64] = setTimeout((postURL, postChannelName, notifChannel) => {
                                        console.log("Sending ID needed message")
                                        const embedMsg = new Discord.MessageEmbed()
                                            .setTitle(`Image Description needed in #${postChannelName}`)
                                            .addField('Image Post Link', postURL);
                                        const role = notifChannel.guild.roles.cache.find(role => role.name === 'Image Description Volunteers');
                                        if (role){
                                            notifChannel.send(`<@&${role.id}>`, { "embed":embedMsg, "allowedMentions": { "roles":[role.id] } })
                                            .then (notifMsg => {
                                                notifMsg.react('✅')
                                            });
                                        }
                                        else{
                                            notifChannel.send(embedMsg)
                                            .then (notifMsg => {
                                                notifMsg.react('✅')
                                            });
                                        }
                                    }, 300000, postURL, postChannelName, notifChannel);
                                }
                                if(successCount == embedCount){
                                    console.log('Deleting user image post');
                                    message.delete();
                                }
                            });
                        });
                    });  
                })
                .catch (err => {
                    console.log(`Error: Unknown processing error ${err}`);
                });
            });
        }
    }
    else {
        console.log('No embeds found')
    }
}

function handleCommands(message) {
    var messageContent = message.content;

    // Check for command
    if (messageContent.substring(0,1) != '!') {
        return;
    }

    console.log(`Got command message: ${messageContent} from ${message.author.tag}`)
    var args = messageContent.substring(1).split(' ');

    var cmd = args[0].toLowerCase();

    args = args.slice(1)

    switch(cmd){
        case 'setimgdesc':
        case 'setimagedesc':
        case 'setimagedescription':
            const usageMsg = "To set an image description send:\n!setimgdesc <picture ID> <image description>\n\nExample:\n!setimgdesc C41LumcAAAA= A chipmunk eating from someone's hand."
            console.log(`Got setimgdesc request`)
            // Argument count error
            if(args.length < 2){
                console.log('Command Error: Not enough parameters')
                message.author.send('Error in setimgdesc command: not enough parameters. You sent:')
                .then( function() {
                    message.author.send(messageContent)
                    .then( function() {
                        message.author.send(usageMsg)
                        .then ( function() {
                            message.delete();
                        });
                    });
                });
                return;
            }

            if(message.channel.name === 'idb-audit-logs') {
                console.log('Command Error: Requested edit in audit logs channel')
                message.author.send('Error in setimgdesc command: Cannot edit image descriptions in #idb-audit-logs')
                .then( function() {
                    message.delete()
                });
                return;
            }

            // Try decoding picture ID
            try {
                var messageID = b64tonum(args[0]).toString();
                var b64ID = numtob64(messageID);
                console.log(`Message ID is ${messageID} (${b64ID})`);
            }
            catch(err){
                console.log('Command Error: Cannot decode picture ID')
                message.author.send('Error in setimgdesc command: invalid picture ID. You sent:')
                .then( function() {
                    message.author.send(messageContent)
                    .then( function() {
                        message.author.send(usageMsg)
                        .then ( function() {
                            message.delete();
                        });
                    });
                });
                return;
            }

            var imageDescription = args.slice(1).join(' ');

            // Find message in channel
            message.channel.messages.fetch(messageID)
            .then( function (toEdit) {

                if (toEdit.author.tag != bot.user.tag){
                    console.log('Command Error: Requested edit on non-bot message')
                    message.author.send('Error in setimgdesc command: Message ID given is not owned by bot. You sent:')
                    .then( function() {
                        message.author.send(messageContent)
                        .then( function() {
                            message.author.send(usageMsg)
                            .then ( function() {
                                message.delete();
                            });
                        });
                    });
                    return;
                }

                var embedMsg = toEdit.embeds[0];
                var prevDescription = embedMsg.fields[1].value;
                var prevAuthor = embedMsg.fields[2].value;
                var newDescription = imageDescription;
                var newAuthor = `<@!${message.author.id}>`;
                embedMsg.fields[1].value = newDescription;
                embedMsg.fields[2].value = newAuthor;
                if (embedMsg.image){
                    var imageURL = embedMsg.image.url;
                    var attachmentName = imageURL.split('/').pop();
                    embedMsg.setImage(`attachment://${attachmentName}`);
                }
                else {
                    var imageURL = null;
                }
                toEdit.edit({ content: toEdit.content, embed: embedMsg })
                    .then( function (doneMsg) {
                        console.log(`Image description updated for ${b64ID}`);
                        if(b64ID in timerDict) {
                            clearTimeout(timerDict[b64ID]);
                            delete timerDict[b64ID];
                        }
                        var auditLogChannel = message.guild.channels.cache.find(channel => channel.name === 'idb-audit-logs');
                        var editedURL = doneMsg.url;
                        if (auditLogChannel){
                            console.log("Posting audit log entry")
                            const embedMsg = new Discord.MessageEmbed()
                                .setTitle('Processing, please wait');
                            auditLogChannel.send(embedMsg)
                            .then( function (sent) {
                                console.log(sent.id);
                                var id64 = numtob64(sent.id);
                                console.log(id64);
                                console.log('Updating audit log with details');
                                const embedMsg = new Discord.MessageEmbed()
                                    .addField('Log Type','Image Description Edited')
                                    .addField('Image Post Link', editedURL)
                                    .addField('Previous Description:', prevDescription)
                                    .addField('Previous Author:', prevAuthor)
                                    .addField('New Description:', newDescription)
                                    .addField('New Author:', newAuthor)
                                    .addField('Undo ID:', id64)
                                    .setThumbnail(imageURL);
                                sent.edit(embedMsg);
                            });
                        }
                        message.delete();
                    });
            })
            .catch( function (err) {
                console.log(err)
                console.log('Command Error: Cannot find picture with given ID')
                message.author.send('Error in setimgdesc command: Cannot find picture with given ID. You sent:')
                .then( function() {
                    message.author.send(messageContent)
                    .then( function() {
                        message.author.send(usageMsg)
                        .then ( function() {
                            message.delete();
                        });
                    });
                });
                return;
            });
            break;
    case 'undo':
    case 'undoedit':
        if(message.channel.name === 'idb-audit-logs') {
            const usageMsg = "To undo an edit:\n!undoedit <undo ID>\n\nExample:\n!undoedit C41LumcAAAA=";
            console.log(`Got undoedit request`);
            // Argument count error
            if(args.length != 1){
                console.log('Command Error: Incorrect number of parameters')
                message.author.send('Error in undoedit command: incorrect number of parameters. You sent:')
                .then( function() {
                    message.author.send(messageContent)
                    .then( function() {
                        message.author.send(usageMsg)
                        .then ( function() {
                            message.delete();
                        });
                    });
                });
                return;
            }

            // Try decoding picture ID
            try {
                var messageID = b64tonum(args[0]).toString();
                var b64ID = numtob64(messageID);
                console.log(`Message ID is ${messageID} (${b64ID})`);
            }
            catch(err){
                console.log('Command Error: Cannot decode undo ID')
                message.author.send('Error in undoedit command: invalid undo ID. You sent:')
                .then( function() {
                    message.author.send(messageContent)
                    .then( function() {
                        message.author.send(usageMsg)
                        .then ( function() {
                            message.delete();
                        });
                    });
                });
                return;
            }

            // Find message in channel
            message.channel.messages.fetch(messageID)
            .then( function (undoLog) {
                if (undoLog.author.tag != bot.user.tag){
                    console.log('Command Error: Requested undo with ID of non-bot message')
                    message.author.send('Error in undoedit command: Undo ID given is not owned by bot. You sent:')
                    .then( function() {
                        message.author.send(messageContent)
                        .then( function() {
                            message.author.send(usageMsg)
                            .then ( function() {
                                message.delete();
                            });
                        });
                    });
                    return;
                }

                var undoEmbedMsg = undoLog.embeds[0];
                if (undoEmbedMsg.fields[0].value != 'Image Description Edited'){
                    console.log('Command Error: Requested undo of non-edit log entry')
                    message.author.send('Error in undoedit command: Requested undo of non-edit log entry. You sent:')
                    .then( function() {
                        message.author.send(messageContent)
                        .then( function() {
                            message.author.send(usageMsg)
                            .then ( function() {
                                message.delete();
                            });
                        });
                    });
                    return;
                }
                var revertURL = undoEmbedMsg.fields[1].value;
                var revertDescription = undoEmbedMsg.fields[2].value;
                var revertAuthor = undoEmbedMsg.fields[3].value;
                // Get message to revert edits on
                var revertURLSplit = revertURL.split('/')
                var revertChannelID = revertURLSplit[revertURLSplit.length - 2];
                var revertMessageID = revertURLSplit[revertURLSplit.length - 1];
                message.guild.channels.resolve(revertChannelID).messages.fetch(revertMessageID)
                .then(function (toEdit) {
                    if (toEdit.author.tag != bot.user.tag){
                        console.log('Command Error: Audit log links to message not owned by bot')
                        message.author.send('Error in undoedit command: Audit log links to message not owned by bot. You sent:')
                        .then( function() {
                            message.author.send(messageContent)
                            .then( function() {
                                message.delete();
                            });
                        });
                        return;
                    }

                    var embedMsg = toEdit.embeds[0];
                    embedMsg.fields[1].value = revertDescription;
                    embedMsg.fields[2].value = revertAuthor;
                    if (embedMsg.image){
                        var imageURL = embedMsg.image.url;
                        var attachmentName = imageURL.split('/').pop();
                        embedMsg.setImage(`attachment://${attachmentName}`);
                    }
                    else {
                        var imageURL = null;
                    }
                    toEdit.edit({ content: toEdit.content, embed: embedMsg })
                        .then( function (doneMsg) {
                            console.log(`Image description updated for ${b64ID}`);
                            var auditLogChannel = message.guild.channels.cache.find(channel => channel.name === 'idb-audit-logs');
                            var editedURL = doneMsg.url;
                            if (auditLogChannel){
                                console.log("Posting audit log entry")
                                const embedMsg = new Discord.MessageEmbed()
                                    .setTitle('Processing, please wait');
                                auditLogChannel.send(embedMsg)
                                .then( function (sent) {
                                    console.log(sent.id);
                                    var id64 = numtob64(sent.id);
                                    console.log(id64);
                                    console.log('Updating audit log with details');
                                    const embedMsg = new Discord.MessageEmbed()
                                        .addField('Log Type','Reverted Image Description Edit')
                                        .addField('Image Post Link', editedURL)
                                        .addField('Reverted Description To:', revertDescription)
                                        .addField('Reverted Author To:', revertAuthor)
                                        .addField('Reverted By:', `<@!${message.author.id}>`)
                                        .setThumbnail(imageURL);
                                    sent.edit(embedMsg);
                                });
                          }
                            message.delete();
                        });
                })
                .catch( function (err) {
                    console.log('Command Error: Cannot find original message to undo edit')
                    message.author.send('Error in undoedit command: Cannot find original message to undo edit (may have been deleted). You sent:')
                    .then( function() {
                        message.author.send(messageContent)
                        .then( function() {
                            message.delete();
                        });
                    });
                    return;
                });
            })
            .catch( function (err) {
                console.log('Command Error: Cannot find audit log with given ID')
                message.author.send('Error in undoedit command: Cannot find audit log with given ID. You sent:')
                .then( function() {
                    message.author.send(messageContent)
                    .then( function() {
                        message.author.send(usageMsg)
                        .then ( function() {
                            message.delete();
                        });
                    });
                });
                return;
            });
        }
        break;
    }
}

// Image extensions filter
function attachmentIsImage(msgAttach) {
    var url = msgAttach.url.toLowerCase();
    const imagefmts = ["png", "jpg", "jpeg", "gif"];
    var i;
    for (i=0; i<imagefmts.length; i++){
        if (url.indexOf(imagefmts[i], url.length - imagefmts[i].length) !== -1){
            return true;
        }
    }
    return false;
}

// Login to Discord and activate bot
bot.login(process.env.DISCORD_BOT_TOKEN);


// Auto-shutdown at 8am UTC so Heroku has fewer daytime restarts
var now = new Date();
var millisTill4 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0) - now;
if (millisTill4 < 0) {
    millisTill4 += 86400000; // After 4am, get time to 4am tomorrow
}
setTimeout(function() {
    console.log('Automatic 4am shut down')
    bot.destroy()
    process.exit()
}, millisTill4);

process.on('SIGINT', function() {
    console.log ('Shutting down')

    bot.destroy()
    process.exit()
});

process.on('SIGTERM', function() {
    console.log ('Shutting down')

    bot.destroy()
    process.exit()
});
