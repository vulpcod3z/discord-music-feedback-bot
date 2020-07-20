////////////////////////////////////////////////
/** Script: Db.js                           **/
/** Author: vulpcod3z                      **/
/** Package: discord-music-feedback-bot   **/
////////////////////////////////////////////

module.exports = class DbPromo {

  ///////////////////////////
  /* constructor          */
  /*  Mongoose instance. */
  ////////////////////////
  constructor(mongoose_instance) {

    // Save connection for further use.
    this.db = mongoose_instance.connection;

    // Load unique validator plugin for schema.
    this.uniquedator = require('mongoose-unique-validator');

    // Db schema for users.
    this.User = this.db.model('User', new mongoose_instance.Schema({
      name: {
        type: String,
        require: true,
        unique: true
      },
      discriminator: {
        type: String,
        require: false,
        unique: false
      },
      id: {
        type: mongoose_instance.Schema.Types.Long,
        require: true,
        unique: true
      },
      points: {
        type: Number,
        require: true,
        unique: false
      },
      last_submitted: {
        type: String,
        require: false,
        unique: false
      },
      total_reviews: {
        type: Number,
        require: true,
        unique: false
      }
    }).plugin(this.uniquedator));
  }

  //////////////////////////////
  /* createUser              */
  /*  Takes arguments and   */
  /*  creates new user.    */
  //////////////////////////
  createUser(name, disc, id, pts = 0, total = 0) {
    return new Promise((res, rej) => {

      // Create new user using model.
      let new_user = new this.User({
        name: name,
        discriminator: disc,
        id: id,
        points: pts,
        total_reviews: total
      });

      // Save the user.
      new_user.save(function (err) {
        if (err) res(1);
        else res(0);
      });
    });
  }

  ////////////////////////////////
  /* findUser                  */
  /*  Takes id and searches   */
  /*  for user and returns   */
  /*  record or code.       */
  ///////////////////////////
  findUser(user, method = 'id') {
    return new Promise((res, rej) => {

      if (method === 'id') {

        // Search for user.
        this.User.findOne({ id: user },
          (err, record) => {

            // If user doesn't exist, return code.
            if (record === null) res(null)

            // If user found, return record.
            else res(record)
          }
        );
      }
      else {
        this.User.findOne({ name: user.username, disc: user.disc },
          (err, record) => {

            // If user doesn't exist, return code.
            if (record === null) res(null)

            // If user found, return record.
            else res(record)
          });
      }
    });
  }


  //////////////////////////
  /* findUsers           */
  /*  Returns records   */
  /*  or code.         */
  //////////////////////
  findUsers() {
    return new Promise((res, rej) => {
      this.User.find({},
        (err, records) => {

          // If no users, return code.
          if (records === null) res(null)
          // else return the records.
          else res(records)
        }
      );
    });
  }

  //////////////////
  /* updateUser  */
  /*            */
  /*           */
  //////////////
  updateUser(user, count) {
    return new Promise((res, rej) => {
      this.User.findOneAndUpdate(
        { id: user },
        {
          $inc: { points: count },
          $inc: { total_reviews: count }
        },
        function (err, record) {
          if (record === null) res(1)
          else {
            res(0);
          }
        }
      );
    });
  }
}
