///////////////////////////////////////////////////////////////////////////////
//////////////
// Modules //
////////////
require('dotenv').config();

const fs = require('fs');

const DbPromo = require('./Db');
const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

const winston = require('winston');
require('winston-daily-rotate-file');

const { Client } = require('discord.js');
const { time } = require('console');


//////////////
// Globals //
////////////
const _bot = new Client();
let _guild,
  _db,
  _logger,
  _ch,
  _filters = JSON.parse(fs.readFileSync('./filters.json'));


///////////
// Logs //
/////////
const file_transport = new winston.transports.DailyRotateFile({
  filename: '%DATE%__info.log',
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: true,
  maxSize: '32m',
  maxFiles: '14d',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(data =>
      `${data.timestamp} | ${data.level} ` +
      `| ${process.argv[1].substr(process.argv[1].lastIndexOf('/') + 1)} ` +
      `| ${data.message}`
    )
  )
});

const cli_transport = new winston.transports.Console({
  level: process.env.LOG_LVL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(data =>
      `${data.timestamp} | ${data.level} ` +
      `| ${process.argv[1].substr(process.argv[1].lastIndexOf('/') + 1)} ` +
      `| ${data.message}`
    )
  )
});

_logger = winston.createLogger({
  transports: [
    file_transport,
    cli_transport
  ]
})


//////////
// IDs //
////////
const GUILD = process.env.ID_GUILD;
const BOT = {
  TOKEN: process.env.TOKEN_BOT,
  ID: process.env.ID_BOT
};
const CH = {
  FEEDBACK: process.env.ID_CH__FEEDBACK,
  FEEDBACK_LINKS: process.env.ID_CH__FEEDBACK_LINKS
}
const ROLES = {};


//////////////////////////
/* Async delay func.   */
////////////////////////
const delay = async (msec) => new Promise((resolve) => setTimeout(resolve, msec));


///////////////////////////
/* Initialize the db.   */
/////////////////////////
const initDB = () => {

  // Connect to Mongo.
  mongoose.connect(`${process.env.DB_URL}/${process.env.DB_NAME}`, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useFindAndModify: false,
    useCreateIndex: true
  });

  // Connector for DbPromo worker class.
  const conn = mongoose.connection;

  // Connect to db and save obj.
  try { conn.on('open', async () => { _db = await new DbPromo(mongoose) }) }

  // Or fail. That's cool too.
  catch (e) {
    console.log("Problem connecting to db.");
    console.error(e)
  }
};


/////////////////////////////
/* Catch command posts.   */
///////////////////////////
const catchCommandPosts = async (msg, user, timestamp) => {

  // Catch any '!#' command, cap or not.
  if (msg.content.startsWith('!#')) {
    let normalized_content = msg.content.toLowerCase();

    /* Check Score */
    if (normalized_content.startsWith('!#score')) {

      _logger.info(`${user.username}#${user.discriminator} is checking score.`);

      // Just delete the message when not a DM. It's junkin' up the thread!
      if (msg.guild !== null) msg.delete();

      // Check for user in db.
      let db_user = await _db.findUser(user.id, 'id');

      // If they exist, DM them their score.
      if (db_user !== null) { user.send(`You have a current score of ${db_user.points} point(s).`) }
      else { user.send('You don\'t have a score because you haven\'t participated yet!!') }
    }
  }
};


////////////////////////////////
/* Catches music feedback.   */
//////////////////////////////
const catchFeedbackPosts = async (msg, user, timestamp) => {

  // If a feedback comment is made..
  if ((msg.content.includes('<feedback>')) && (msg.mentions.users.size > 0)) {

    // Clean content and remove mention/tag.
    let clean_index = (msg.content.indexOf('k>')) + 2;
    let content = msg.content.slice(clean_index);

    // If they aren't tagging themselves..
    let mentioned = msg.mentions.users.entries().next().value[0];
    if (mentioned !== user.id) {

      // ...check for user in db..
      let db_user = await _db.findUser(user.id, 'id');

      // ...and if they exist..
      if (db_user !== null) {

        // ...and comment length checks out, add points.
        if (content.length >= 190) {
          await awardValidFeedback(user, db_user);
          _logger.info(`${user.username}#${user.discriminator} has left valid feedback to ${mentioned}.`);
        }

        // ...not proper length.
        else { _logger.info(`${user.username}#${user.discriminator} has left invalid feedback to ${mentioned}.`) }
      }

      // ...if user doesn't exist..
      else {

        // ...but content length checks out..
        if (content.length >= 55) {

          // ...create new user with one point!
          await createNewUser(user, 1);
          _logger.info(`${user.username}#${user.discriminator} has left valid feedback to ${mentioned}.`);
        }

        // ...and the content length is bad..
        else {

          // ...create new user, no points :(
          await createNewUser(user);
          _logger.info(`${user.username}#${user.discriminator} has left invalid feedback to ${mentioned}.`);
        }
      }
    }

    // If they've tagged themselves, it's likely just a quote. Move along.
    else { _logger.info(`${user.username}#${user.discriminator} is just quoting..`) }
  }
}


/* Adds points to user for valid feedback.   */
//////////////////////////////////////////////
const awardValidFeedback = async (user, db_user) => {

  // Add one to current point level and reviews.
  let new_pts = (db_user.points + 1);
  let total_pts = (db_user.total_reviews + 1);

  // Set new values and save.
  db_user.points = new_pts;
  db_user.total_reviews = total_pts;
  await db_user.save();
};


/////////////////////////////
/* Catches music posts.   */
///////////////////////////
const catchMusicPosts = async (msg, user, timestamp) => {
  // If in feedback channel..
  if ((msg.channel.id === CH.FEEDBACK) && !(msg.content.startsWith('c#'))) {

    // Find link in filters.
    let matching_filters = _filters.links.filter(link => msg.content.includes(link));
    let is_link = matching_filters.length > 0;

    // If a link is posted..
    if (msg.content.includes('http') && is_link) {

      _logger.info(`${msg.author.username}#${msg.author.discriminator} tried placing a feedback link ${msg.content}`);

      // Check for user in db.
      let db_user = await _db.findUser(user.id, 'id');

      // If they exist..
      if (db_user !== null) {

        // ...and necessary points are there, deduct and post.
        if (db_user.points >= 3) { await deductAndPost(msg, msg.content, user, db_user, 'link') }

        // ...and there's not enough points, delete and notify.
        else { deleteAndNotify(msg, user, 'points') }
      }

      // If they don't exist, create them, delete message, and notify.
      else {
        await createNewUser(user);
        deleteAndNotify(msg, user, 'exists');
      }
    }

    // If there's an attachment (a file)..
    if (msg.attachments.size > 0) {

      // ...get the name of the attachment.
      let att = msg.attachments.entries().next().value[1].name;

      // Find filetype in filters.
      let matching_filters = _filters.filetypes.filter(type => att.includes(type));
      let is_file = matching_filters.length > 0;

      // If the attachment name contains any of the following file formats, catch it.
      if (is_file) {

        _logger.info(`${msg.author.username}#${msg.author.discriminator} tried placing a feedback file`);

        // Check for user in db..
        let db_user = await _db.findUser(user.id, 'id');

        // ...and if they exist..
        if (db_user !== null) {

          // ...and necessary points are there, deduct and post.
          if (db_user.points >= 3) { await deductAndPost(msg, msg.content, user, db_user, 'attachment') }

          // ...and there's not enough points, delete and notify.
          else { deleteAndNotify(msg, user, 'points') }
        }

        // ..and if they don't exist, create them, delete message, and notify.
        else {
          await createNewUser();
          deleteAndNotify(msg, user, 'exists');
        }
      }
    }
  }
}


/////////////////////////////////
/* Create new user and log.   */
///////////////////////////////
const createNewUser = async (user, pts = 0) => {
  await _db.createUser(user.username, user.discriminator, user.id, pts);
  _logger.info(`${user.username}#${user.discriminator} has been created.`);
};


//////////////////////////////////////////////////////////////////////////////
/* Format music post, attachment or not, and post in designated channel.   */
////////////////////////////////////////////////////////////////////////////
const formatMusicPost = async (msg, user, content, has_att = false) => {

  // Post in feedback.
  let ch = await _bot.channels.fetch(CH.FEEDBACK_LINKS);

  // Template for making post.
  let feedback_post_markup = [
    "\`\`\`md\n<feedback-request>[",
    "]\n\`\`\`"
  ];

  if (has_att) {
    await ch.send(`${feedback_post_markup[0]}${user.username}${feedback_post_markup[1]}\n`
      + `${msg.attachments.entries().next().value[1].url}`);
  }
  else await ch.send(`${feedback_post_markup[0]}${user.username}${feedback_post_markup[1]}\n${content}`);
};


///////////////////////////////////////////////////////////////////
/* Subtracts users points and initializes the formatted post.   */
/////////////////////////////////////////////////////////////////
const deductAndPost = async (msg, content, user, db_user, type) => {
  let new_pts = (db_user.points - 3);
  db_user.points = new_pts;
  await db_user.save();

  switch (type) {

    // Create formatted post, with link, in locked channel.
    case 'link':
      await formatMusicPost(msg, user, content);
      _logger.info(`${user.username} exists and has successfully posted a track. `
        + 'Points have been deducted');
      break;

    // Create formatted post in locked channel.
    case 'attachment':
      await formatMusicPost(msg, user, content, true);
      _logger.info(`${user.username}#${user.discriminator} exists and has `
        + 'successfully posted a music-based attachment. Points have been deducted');
      break;

    default:
      break;
  }
};


/////////////////////////////////////////////////////////////////////////
/* Deletes post ends user a notification explaining lack of points.   */
///////////////////////////////////////////////////////////////////////
const deleteAndNotify = (msg, user, reason) => {

  // Deletes post.
  msg.delete();

  // Notify user via DM.
  user.send('Hey pal, you don\'t have enough points to post your track. '
    + 'Make sure you\'re using the correct method to post feedback:\n'
    + '*@user*<feedback>\n'
    + 'Feedback content here.\n'
    + 'You can check your score by sending the command below:\n\`c#score\`');


  // Send different logs depending on reason.
  switch (reason) {
    case 'exists':
      _logger.info(`${user.username}#${user.discriminator} does not exist. `
        + 'Post has been removed and notification sent.');
      break;

    case 'points':
      _logger.info(`${user.username}#${user.discriminator} does not have enough points. `
        + 'Sub has been removed and notification sent.');
      break;

    default:
      break;
  }
};


////////////////////////////////
/* LISTENER :: When ready.   */
//////////////////////////////
_bot.on('ready', async () => {
  console.log(`Logged in as ${_bot.user.tag}!`);

  // Connect db.
  initDB();

  // Set role, channel, guild, etc. IDs.
  _guild = await _bot.guilds.cache.get(GUILD);
});


//////////////////////////////////////////
/* LISTENER :: Catches all messages.   */
////////////////////////////////////////
_bot.on('message', async msg => {

  // Gather message data.
  let user = msg.author;
  let content = msg.content;
  let timestamp = (new Date(msg.createdTimestamp)).toString().slice(0, 21);

  await catchCommandPosts(msg, user, timestamp);
  await catchFeedbackPosts(msg, user, timestamp);
  await catchMusicPosts(msg, user, timestamp);
});


////////////////////////////////////////
/* MAIN :: Connect bot to Discord!   */
//////////////////////////////////////
try { _bot.login(BOT.TOKEN) }
catch (e) { console.log("Total failure. Check the environment.") }
