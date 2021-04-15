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

const bot = new Discord.Client();

// Log when connection succeeeds
bot.on('ready', function(evt) {
    console.log('Connected');
    console.log('Logged in as: ');
    console.log(bot.user.tag);
});

// Main bot code
bot.on('message', function (message) {
    var messageContent = message.content;
    console.log('Got message');
    console.log(numtob64(message.id));
    // Check for attachment
    if (message.attachments.size > 0) {
        console.log('Message has attachments');
        if (message.attachments.every(attachmentIsImage)){
            console.log('Image attachments found');
            message.attachments.forEach( function (img) {
                console.log('Posting image');
                const embedMsg = new Discord.MessageEmbed()
                    .setTitle('Processing, please wait');
                message.channel.send(embedMsg)
                .then( function (sent) {
                    console.log(sent.id);
                    var id64 = numtob64(sent.id);
                    const embedMsg = new Discord.MessageEmbed()
                        .setTitle(`Picture ${id64}`)
                        .addField('Posted By:',`<@${message.author.id}>`)
                        .setDescription(messageContent)
                        .addField('Image Description:', 'Description not yet set, use !setimgdesc to add description.')
                        .addField('Image Description Written By:', 'Nobody')
                        .setImage(img.url);
                    sent.edit(embedMsg)
                    .then( function (doneMsg) {
                        console.log(doneMsg.id)
                        console.log(id64)
                        message.delete()
                    });
                });
            });
        }
    }
    
    // Check for command
    if (messageContent.substring(0,1) == '!') {
        var args = messageContent.substring(1).split(' ');
        
        var cmd = args[0];
        
        args = args.slice(1)
        
        switch(cmd){
            case 'setimgdesc':
                if(args.length >= 2){
                    var messageID = b64tonum(args[0]).toString();
                    var description = args.slice(1).join(' ');
                    console.log(messageID)
                    message.channel.messages.fetch(messageID)
                        .then( function (toEdit) {
                            var embedMsg = toEdit.embeds[0]
                            embedMsg.fields[1].value = description
                            embedMsg.fields[2].value = `<@${message.author.id}>`
                            toEdit.edit(embedMsg)
                                .then( function (doneMsg) {
                                    message.delete();
                                });
                        });
                }
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
