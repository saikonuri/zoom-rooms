var loki = require('lokijs'); // https://github.com/techfort/LokiJS/wiki

var db = new loki('rooms.db');

var rooms = db.addCollection('rooms');

/* CHECKS */
function roomExists(roomName) {
  var room = rooms.findOne({ 'name': roomName });
  if (room === null) {
    return false;
  }
  return true;
}

function userExistsInRoom(roomName, user) {
  var room = rooms.findOne({ 'name': roomName });

  if (room.users.includes(user)) {
    return true
  }
  return false;
}


/* ROOM API */
exports.createRoom = function (roomName, creator) {
  if (roomExists(roomName)) {
    return [false, 'Room already exists'];
  }
  rooms.insert({ name: roomName, game: null, creator: creator, users: [creator], chat: [] });
  return [true, rooms.findOne({ 'name': roomName })];
}

exports.joinRoom = function (roomName, user) {
  if (roomExists(roomName) === false) {
    return [false, 'Room ' + roomName + ' does not exist'];
  }
  // check if user already exists in this room
  if (userExistsInRoom(roomName, user)) {
    return [false, 'User ' + user + ' already exists in the room'];
  }

  var room = rooms.findOne({ 'name': roomName });
  room.users.push(user);
  rooms.update(room);

  room.chat = [];
  return [true, room];
}

exports.addChatMessage = function (message) {
  var room = rooms.findOne({ 'name': message.room });
  room.chat.push({ user: message.user, message: message.text });
  rooms.update(room);
}

/* SPADE API */

function shuffleDeck(deck) {
  var shuffled = deck.slice();

  for (let i = deck.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i

    // swap elements array[i] and array[j]
    // we use "destructuring assignment" syntax to achieve that
    // you'll find more details about that syntax in later chapters
    // same can be written as:
    let t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t
  }

  return shuffled;
}

function setOrderSpades(colors, teams) {
  let order = [];
  let activeTeams = [];
  for (var i = 0; i < colors.length; i++) {
    if (teams[colors[i]].users.length > 0) {
      activeTeams.push(colors[i]);
    }
  }

  let teamSize = teams[activeTeams[0]].users.length;
  for (var teamIdx = 0; teamIdx < teamSize; teamIdx++) {
    for (var i = 0; i < activeTeams.length; i++) {
      order.push(teams[activeTeams[i]].users[teamIdx]);
    }
  }

  return order;
}

function dealSpades(deck, handSize, dealer, order, players) {
  let flat = [];
  for (var i = dealer + 1; i < order.length; i++) {
    flat.push(order[i]);
  }

  for (var i = 0; i <= dealer; i++) {
    flat.push(order[i]);
  }

  var deckIdx = 0;
  console.log(players);
  console.log(flat);
  console.log(order);
  for (var j = 1; j <= handSize; j++) {
    for (var i = 0; i < flat.length; i++) {
      players[flat[i]].hand.push(deck[deckIdx]);
      deckIdx++;
    }
  }

  return players;
}

function skipPrediction(game) {
  if (game.teams[game.players[game.order[game.turn]].team].prediction > -1) {
    return true;
  }

  return false;
}

exports.predictSpades = function (room, user, data) {
  var room = rooms.findOne({ 'name': room });
  room.game.teams[room.game.players[user].team].prediction = data.prediction;

  // if the dealer made a prediction, then move to next stage
  if (room.game.turn == room.game.dealer) {
    room.game.stage = "TRICK";
    room.game.turn += 1;
    if (room.game.turn == room.game.order.length) {
      room.game.turn = 0;
    }
    rooms.update(room);
    return { teams: room.game.teams, turn: room.game.turn, stage: room.game.stage };
  }

  room.game.turn += 1;
  if (room.game.turn == room.game.order.length) {
    room.game.turn = 0;
  }

  while (skipPrediction(game)) {
    if (room.game.turn === room.game.dealer) {
      room.game.stage = "TRICK";
      room.game.turn += 1;
      if (room.game.turn == room.game.order.length) {
        room.game.turn = 0;
      }
      break;
    }
    room.game.turn += 1;
    if (room.game.turn == room.game.order.length) {
      room.game.turn = 0;
    }
  }

  rooms.update(room);

  return { teams: room.game.teams, turn: room.game.turn, stage: room.game.stage };
}

function getCardValue(card) {
  if(card == "JOKER"){
    return "JOKER";
  }
  const val = card.substring(0, card.length - 1);
  var ret = null;

  if (val == "J") {
    return 11;
  }

  if (val == "Q") {
    return 12;
  }

  if (val == "K") {
    return 13;
  }

  if (val == "A") {
    return 14;
  }

  return parseInt(val);
}

function getSuit(card) {
  if (card == "JOKER") {
    return "spades";
  }

  var suit = card.substring(card.length - 1, card.length);

  if (suit == "S") {
    return "spades";
  }
  if (suit == "H") {
    return "hearts";
  }
  if (suit == "D") {
    return "diamonds";
  }
  if (suit == "C") {
    return "clubs";
  }

  return null;
}

function checkCut(next, current) {
  const nextVal = getCardValue(next);
  const nextSuit = getSuit(next);
  const currentVal = getCardValue(current);
  const currentSuit = getSuit(current);

  if (nextVal == "JOKER") {
    return true;
  }

  if (nextSuit == "spades" && currentSuit !== "spades") {
    return true;
  }

  if ((nextSuit == currentSuit) && (currentVal != "JOKER")) {
    return getCardValue(next) >= getCardValue(current);
  }

  return false;
}

exports.discardSpades = function (room, user, data) {
  var room = rooms.findOne({ 'name': room });
  var card = room.game.players[user].hand[data.index];
  var advance = false;
  var prev = null;

  room.game.players[user].discard = card;
  room.game.players[user].hand.splice(data.index, 1);
  if (room.game.turn == room.game.dealer) {
    advance = true;
    prev = data.index;
  }

  room.game.turn += 1;
  if (room.game.turn == room.game.order.length) {
    room.game.turn = 0;
  }

  if (room.game.startingSuit == null) {
    room.game.startingSuit = getSuit(card);
    room.game.currentWinning = user;
  } else {
    if (checkCut(card, room.game.players[room.game.currentWinning].discard)) {
      room.game.currentWinning = user;
    }
  }

  if (advance) {
    // Update round
    var winningTeam = room.game.players[room.game.currentWinning].team;
    room.game.teams[winningTeam].current += 1;

    var remainingTricks = 0;
    for (var i = 0; i < room.game.order.length; i++) {
      room.game.players[room.game.order[i]].discard = null;
      remainingTricks = room.game.players[room.game.order[i]].hand.length;
    }
    room.game.dealer = room.game.order.indexOf(room.game.currentWinning) - 1;
    if(room.game.dealer < 0){
      room.game.dealer = room.game.order.length - 1;
    }
    room.game.turn = room.game.dealer + 1;
    if (room.game.turn == room.game.order.length) room.game.turn = 0;

    room.game.currentWinning = null;
    room.game.startingSuit = null;

    // Next round
    if (remainingTricks == 0) {
      room.game.dealer += 1;
      if(room.game.dealer == room.game.order.length) room.game.dealer = 0;
      room.game.turn = room.game.dealer + 1;
      if (room.game.turn == room.game.order.length) room.game.turn = 0;

      let teams = Object.keys(room.game.teams);
      for (var i = 0; i < teams.length; i++) {
        if (room.game.teams[teams[i]].users.length > 0) {
          if (room.game.teams[teams[i]].current >= room.game.teams[teams[i]].prediction) {

            room.game.teams[teams[i]].points += 10 * room.game.teams[teams[i]].prediction;

            room.game.teams[teams[i]].bags += (room.game.teams[teams[i]].current - room.game.teams[teams[i]].prediction);

            var bagsMult = Math.floor(room.game.teams[teams[i]].bags / 3);
            room.game.teams[teams[i]].points -= 30 * bagsMult;
            room.game.teams[teams[i]].bags = room.game.teams[teams[i]].bags % 3;

          } else {
            room.game.teams[teams[i]].points -= 10 * room.game.teams[teams[i]].prediction;
          }

          room.game.teams[teams[i]].current = 0;
          room.game.teams[teams[i]].prediction = -1;
        }
      }

      room.game.stage = "PREDICT";
      room.game.round += 1;

      if (room.game.round == 14) {
        room.game.stage = "FINISH";
      } else {
        let deck = shuffleDeck(room.game.deck);
        room.game.deck = deck;
        // hand out cards...
        room.game.players = dealSpades(deck, room.game.round /* handSize */, room.game.dealer /* dealer */, room.game.order, room.game.players);
      }
    }
  }

  rooms.update(room);
  return {
    currentWinning: room.game.currentWinning,
    startingSuit: room.game.startingSuit,
    turn: room.game.turn,
    stage: room.game.stage,
    teams: room.game.teams,
    players: room.game.players,
    dealer: room.game.dealer,
    round: room.game.round,
    prev: prev
  };
}

exports.shuffleSpades = function (room, deck) {
  var room = rooms.findOne({ 'name': room });
  room.game.deck = shuffleDeck(deck);
  rooms.update(room);

  return { deck: room.game.deck };
}

exports.setTeamsSpades = function (room, data) {
  let teams = data.teams;
  let players = data.players;

  var room = rooms.findOne({ 'name': room });
  room.game.teams = teams;
  room.game.players = players;
  // update the sitting order (spacing between teammates)
  room.game.order = setOrderSpades(Object.keys(teams), teams);

  rooms.update(room);

  return { teams: room.game.teams, players: room.game.players, order: room.game.order };
}

exports.startSpades = function (room) {
  var room = rooms.findOne({ 'name': room });
  let deck = shuffleDeck(room.game.deck);
  room.game.round = 1;
  room.game.deck = deck;
  // hand out cards...
  room.game.players = dealSpades(deck, 1 /* handSize */, 0 /* dealer */, room.game.order, room.game.players);
  rooms.update(room);

  return { round: 1, deck: room.game.deck, players: room.game.players };
}

exports.restartSpades = function (room) {
  var room = rooms.findOne({ 'name': room });
  room.game.round = 0;
  room.game.deck = shuffleDeck(room.game.deck);

  let u = Object.keys(room.game.players);
  for (var i = 0; i < u.length; i++) {
    room.game.players[u[i]] = {
      ...room.game.players[u[i]],
      hand: [],
      discard: null
    };

    let team = room.game.teams[room.game.players[u[i]].team];
    room.game.teams[room.game.players[u[i]].team] = {
      ...team,
      points: 0,
      bags: 0,
      prediction: -1,
      current: 0
    };
  }

  room.game.stage = 'PREDICT';
  room.game.turn = 1;
  room.game.dealer = 0;
  room.currentWinning = null,
  room.startingSuit = null
  rooms.update(room);

  return { currentWinning: null, startingSuit: null, round: 0, deck: room.game.deck, players: room.game.players, teams: room.game.teams, stage: room.game.stage, turn: room.game.turn, dealer: room.game.dealer };
}

function emptySpades(u) {
  game = {
    name: 'SPADES',
    teams: {
      'red': { users: [] },
      'blue': { users: [] },
      'yellow': { users: [] },
      'black': { users: [] },
      'orange': { users: [] },
      'pink': { users: [] },
      'green': { users: [] },
      'grey': { users: [] }
    },
    deck: [
      '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'JS', 'QS', 'KS', 'AS',
      '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', 'JC', 'QC', 'KC', 'AC',
      '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', 'JH', 'QH', 'KH', 'AH',
      '2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D', '10D', 'JD', 'QD', 'KD', 'AD',
      'JOKER', 'JOKER'
    ],
    round: 0,
    players: {},
    order: [...u],
    stage: 'PREDICT',
    turn: 1,
    dealer: 0,
    currentWinning: null,
    startingSuit: null
  };

  colors = Object.keys(game.teams);

  for (var i = 0; i < u.length; i++) {
    user = u[i];
    game.players[user] = {
      hand: [],
      discard: null,
      team: colors[i]
    };

    game.teams[colors[i]] = {
      users: [user],
      points: 0,
      bags: 0,
      prediction: -1,
      current: 0
    };
  }

  if (u.length > 4) {
    game.deck.concat(game.deck);
  }

  return game;
}


/* SKULL API */
function emptySkull(users) {
  game = {
    name: 'SKULL',
    points: {},
    cards: {},
    pot: {}
  }

  for (u of users) {
    game.points[u] = 0;
    game.cards[u] = ['flower', 'skull', 'flower', 'flower'];
    game.pot[u] = [];
  }

  return game;

}

function placeCard(roomName, user, data) {
  var room = rooms.findOne({ 'name': roomName });
  var cardVal = room.game.cards[user][data.cardIndex];

  room.game.pot[user].concat({ card: cardVal, revealed: false });
  room.game.cards[user].splice(data.cardIndex, 1);

  rooms.update(room);
  return {
    action: 'place',
    user: user,
    cardIndex: data.cardIndex,
  };
}

function revealCard(roomName, clickingUser, data) {
  var room = rooms.findOne({ 'name': roomName });
  var cardObj = room.game.pot[data.otherUser][data.cardIndex];

  if (cardObj.card == 'skull') {
    for (u of room.users) {
      room.game.pot[u] = [];
    }

    return {
      action: 'reveal',
      user: clickingUser,
      otherUser: data.otherUser,
      cardIndex: data.cardIndex,
    }
  } else {
    room.game.pot[data.otherUser][data.cardIndex].revealed = true;

    return {
      action: 'reveal',
      user: clickingUser,
      otherUser: data.otherUser,
      cardIndex: data.cardIndex,
    }
  }
}

exports.skullAction = function (roomName, user, action, data) {
  switch (action) {
    case 'place':
      return placeCard(roomName, user, data);
    case 'reveal':
      return revealCard(roomName, user, data);
    default:
      return 'Invalid Action';
  }
}


/* GENERAL GAME API */
function emptyGame(gameType, users) {
  game = null
  switch (gameType) {
    case 'skull':
      return emptySkull(users);
    case 'spades':
      return emptySpades(users);
    default:
      return 'Invalid Game'
  }
}

exports.startGame = function (roomName, user, gameType) {
  var room = rooms.findOne({ 'name': roomName });
  room.game = emptyGame(gameType, room.users);
  rooms.update(room);

  return room.game;
}
