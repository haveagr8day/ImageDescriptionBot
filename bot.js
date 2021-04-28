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

const bot = new Discord.Client();

function download(url, dest, cb) {

};

// Log when connection succeeeds
bot.on('ready', function(evt) {
    console.log('Connected');
    console.log('Logged in as: ');
    console.log(bot.user.tag);
});

// Main bot code
bot.on('message', function (message) {
    var messageContent = message.content;
    
    // Ignore bot messages
    if(message.author.tag == bot.user.tag) {
        return null;
    }
    
    console.log(`Got message ${message.id}`);
    // Check for single attachment
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
                                return null;
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
                                        //    .setTitle(`Picture ${id64}`)
                                            .addField('Posted By:',`<@!${message.author.id}>`)
                                            .setDescription(messageContent)
                                            .addField('Image Description:', 'Description not yet set, use !setimgdesc to add description.')
                                            .addField('Image Description Written By:', 'Nobody')
                                            .setImage(`attachment://${filename}`);
                                        sent.edit(embedMsg)
                                        .then( function (doneEmbed) {
                                            doneEmbed.edit(`${id64}`)
                                            .then( function (doneMsg) {
                                                successCount++;
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
     
    
    // Check for command
    if (messageContent.substring(0,1) == '!') {
        console.log(`Got command message: ${messageContent} from ${message.author.tag}`)
        var args = messageContent.substring(1).split(' ');
        
        var cmd = args[0];
        
        args = args.slice(1)
        
        switch(cmd){
            case 'setimgdesc':
            case 'setimagedesc':
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
                    return null;
                }
                
                // Try decoding picture ID
                try {
                    var messageID = b64tonum(args[0]).toString();
                    console.log(`Message ID is ${messageID} (${args[0]})`)
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
                    return null;
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
                        return null; 
                    }
                    
                    var embedMsg = toEdit.embeds[0]
                    embedMsg.fields[1].value = imageDescription
                    embedMsg.fields[2].value = `<@!${message.author.id}>`
                    var attachmentName = embedMsg.image.url.split('/').pop();
                    embedMsg.setImage(`attachment://${attachmentName}`);
                    toEdit.edit(embedMsg)
                        .then( function (doneMsg) {
                            console.log(`Image description updated for ${args[0]}`)
                            message.delete();
                        });
                })
                .catch( function (err) {
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
                    return null;
                });
            break;
        }
    }
});

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
