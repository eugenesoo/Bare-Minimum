const db = require('./index.js');
const Promise = require('bluebird');

// ==== USERS ====

const addUser = function(user, callback) {
  db.Users.create(user)
    .then(() => {
      return callback();
    })
    .catch((err) => {
      console.error('there was an error on user database insert ', err.message);
      callback(err);
    }).catch((err) => {
      console.error('Bad username request! Name may be taken.');
    });
};

const findUser = function(user, callback) {
  db.Users.findAll({where: {name: user.name}})
    .then((foundUser) => {
      callback(foundUser);
    })
    .catch((err) => {
      console.error('There was an error in user lookup', err);
    });
};

const findUserByEmail = function(user, callback) {
  db.Users.findAll({where: {email: user.name}})
    .then((foundUser) => {
      return callback(foundUser);
    })
    .catch((err) => {
      console.error('There was an error in user lookup', err);
    });
};

// ==== USERS & TRIPS ====

const findUsersOnTrip = function(tripId, callback) {
  // query equivalent to:
  // `SELECT Users.name, Users.id FROM UserTrips, Users WHERE Users.id = UserTrips.UserId AND UserTrips.tripId = ${tripId}`
  db.Users.findAll({
    include: [{
      model: db.Trips,
      where: { id: tripId }
    }]
  })
    .then((result) => {
      return callback(result);
    })
    .catch((err) => {
      console.error('There was an error looking up users on trip', err);
      return callback(err);
    });
};

const findTripsForUser = function(userId, callback) {
  db.Trips.findAll({
    include: [{
      model: db.Users,
      where: { id: userId }
    }]
  })
    .then((result) => {
      return callback(result);
    })
    .catch((err) => {
      console.error('There was an error looking up trips for user', err);
      callback(err);
    });
};

// TODO: setUserTripDetails

// get trip-specific user details (itinerary, phone)
const getUserTripDetails = function(userId, tripId, callback) {
  console.log(userId, tripId);

  db.UserTrip.findOne({ where: { TripId: tripId, UserId: userId } })
    .then((result) => {
      return callback(result);
    })
    .catch((err) => {
      console.error('There was an error looking up user details', err);
      return callback(err);
    });
};

const updateUserTripDetails = function(userId, tripId, itinerary, phone, callback) {
  console.log(userId, tripId);

  db.UserTrip.update({ flightItinerary: itinerary, phone: phone },
    {
      where: {
        TripId: tripId,
        UserId: userId
      }
    })
    .then((result, data) => {
      console.log('SET USER DETAILS');
      return callback(result);
    })
    .catch((err) => {
      console.error('There was an error setting user details', err);
      return callback(err);
    });
};

// ==== SESSIONS =====

//this helper function can be used to add foreign keys between users and sessions... not sure if neccessary
const addSession = function(sessionId, email) {
  console.log('this is db helper ', sessionId, email);
};


// Notifications

const getDetailedNotification = (notification) => {
  if (notification.type === 'expense') {
    return db.Expenses.findOne({ 
      where: { id: notification.contentId },
      ordering: [['createdAt', 'DESC']]
    });
  }
};

const getNotificationForTrip = (tripId) => {
  return new Promise((resolve, reject) => {
    db.Notifications.findAll({ where: { tripId: tripId } })
      .then((results) => {
        let counter = 0;
        let finishCall = () => {
          counter++;
          if (counter === results.length) {
            resolve(results);
          }
        };
        for (let i = 0; i < results.length; i++) {
          getDetailedNotification(results[i].dataValues)
            .then((content) => {
              let notification = results[i].dataValues;
              notification.content = content.dataValues;
              results[i] = notification;
              finishCall();
            })
            .catch((err) => reject(err));
        }
      })
      .catch((err) => reject(err));
  });
};

const generateNotification = (tripId, type, contentId) => {
  return db.Notifications.create({ tripId: tripId, type: type, contentId: contentId })
    .then((result) => result)
    .catch((err) => console.log(`error occur when generating notification: ${err}`));
};

// ==== TRIPS ====

const createTrip = function(trip, callback) {
  db.Trips.create(trip)
    .then((result) => {
      callback(result.dataValues);
      return db.UserTrip.create({
        flightItinerary: '',
        phone: '',
        UserId: trip.userId,
        TripId: result.dataValues.id
      });
    })
    .catch((err) => {
      console.error('Trip name already exist please try a new name. ', err);
      callback(err);
    });
};

const joinTrip = function(body, callback) {
  db.Trips.findOne({where: {accessCode: body.accessCode}})
    .then((trip) => {
      if (trip) {
        return db.UserTrip.create({
          flightItinerary: '',
          phone: '',
          UserId: body.userId,
          TripId: trip.id
        })
          .then(() => {
            return callback();
          });
      } else {
        callback('trip did not exist');
      }
    });
};

// ==== LANDMARKS ====

const addLandmark = function(landmark, callback) {
  db.Users.findOne({where: {email: landmark.user}})
    .then ((user) => {
      return db.Landmarks.create({
        url: landmark.url,
        description: landmark.description,
        address: landmark.address,
        tripId: landmark.tripId,
        userId: user.id
      });
    })
    .then(() => {
      return callback();
    })
    .catch((err) => {
      console.log('there was an error on landmark create', err);
    });
};

const findLandmarks = function(tripId, callback) {
  db.Landmarks.findAll({
    where: {tripId: tripId},
    limit: 20,
    attributes: ['url', 'description', 'address', 'id'],
    include: [{model: db.Users, attributes: ['name', 'id']}]
  })
    .then((landmarks) => {
      let promise = landmarks.map((landmark) => {
        return db.Votes.findAll({where: {landmarkId: landmark.id}})
          .then((votes) => {
            landmark.dataValues.votes = votes;
            return landmark;
          });
      });
      Promise.all(promise)
        .then((results) => {
          return callback(results);
        });
    })
    .catch((err) => {
      console.log('there was an error finding Landmarks ', err);
    });
};

// ==== EXPENSES ==== 

const createExpense = function(options) {
  return new Promise ((resolve, reject) => {
    return db.Expenses.create(options)
      .then((result) => {
        resolve('Added to database');
        return generateNotification(options.tripId, 'expense', result.dataValues.id);
      })
      .then((result) => {
        console.log(result.dataValues);
        // TODO: send notification through socket
        
      })
      .catch((err) => {
        reject(err);
      });
  });
};

const getExpensesForTrip = function(targetId) {
  console.log('Database searching for expenses with tripId', targetId);
  return new Promise ((resolve, reject) => {
    return db.Expenses.findAll({ where: { tripId: targetId } })
      .then((result) => {
        resolve(result);
      })
      .catch((err) => {
        console.error('There was an error looking up expenses for trip', err);
        reject(err);
      });
  });
};

const findAllPhotos = () => {
  return db.Photos.findAll();
};

const addPhotos = (images) => {
  console.log('here with images', images);
  return db.Photos.bulkCreate(images)
    .then(() => db.Photos.findAll({where: {tripId: images[0].tripId}}));
};

module.exports = {
  addUser: addUser,
  findUser: findUser,
  addSession: addSession,
  findUsersOnTrip: findUsersOnTrip,
  createTrip: createTrip,
  addLandmark: addLandmark,
  findLandmarks: findLandmarks,
  findUserByEmail: findUserByEmail,
  findTripsForUser: findTripsForUser,
  createExpense: createExpense,
  getExpensesForTrip: getExpensesForTrip,
  joinTrip: joinTrip,
  getUserTripDetails: getUserTripDetails,
  updateUserTripDetails: updateUserTripDetails,
  findAllPhotos: findAllPhotos,
  getNotificationForTrip: getNotificationForTrip,
  addPhotos: addPhotos
};
