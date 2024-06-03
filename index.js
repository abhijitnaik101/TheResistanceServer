const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
})

const missionInfo = {
  1: { strength: 2, sabotage: 1 },
  2: { strength: 2, sabotage: 1 },
  3: { strength: 2, sabotage: 1 },
  4: { strength: 2, sabotage: 1 },
  5: { strength: 2, sabotage: 1 },
}

var users = [], userCount = 0;
var messagesArr = [];
var votes = [], voteCount = 0, voteTrack = [0, 0, 0, 0, 0];
var playCount = 0, king = 0;
var missionMems = [];
var missionVote = [], missionVCount = 0, missionNo = 1, missionTrack = [], bluepoint = 0, redpoint = 0;

for (let i = 1; i <= 5; i++) {
  missionTrack.push(missionInfo[i].strength);
}



io.use((socket, next) => {
  const username = socket.handshake.auth.username;
  const roomid = socket.handshake.auth.roomid;
  if (!username) {
    return next(new Error("invalid username"));
  }
  socket.username = username;
  socket.roomid = roomid;
  next();
});
debugger
io.on('connect', (socket) => {

  console.log(`New user connected with id : ${socket.id} , in room : ${socket.roomid}, username : ${socket.username}`);

  const user = {
    id: socket.id,
    username: socket.username,
    roomid: socket.roomid,
    role: 'operative',
    playPressed: false,
    king: false,
  }

  //put user in array
  users.push(user);
  userCount++;

  socket.on('play', () => {
    users.filter((user) => user.id == socket.id)[0].playPressed = true;
    playCount++;
    console.log("playcount :", playCount);
    if (playCount == users.length) {
      king = 0;
      missionNo = 1;
      let random = 0;//use Math.Random logic
      users[random].role = 'spy';
      io.emit('start', users[king].id, missionNo, missionInfo);
      io.emit('users', userCount, users.filter((user) => user.roomid == socket.roomid));
      //playCount = 0;
    }
  })

  socket.on('disconnect', () => {
    userCount--;
    if (users.filter((user) => user.id == socket.id)[0].playPressed)
      playCount--;
    console.log("playC in dix:", playCount);
    //remove elements from array
    let index;
    for (let i = 0; i < users.length; i++)
      if (users[i].id == socket.id)
        index = i;

    if (index > -1)
      users.splice(index, 1);

    console.log(`${socket.id} is disconnected`);

    //letem' know user is diconnected
    io.emit('users', userCount, users);
    if(socket.id == king)
    nextTurn(800);
    //if all users disconnected then delete all msgs and revert all variable to their default values
    if (userCount == 0) {
      users = [];
      playCount = 0;
      voteCount = 0;
      messagesArr = [];
      votes = [];
      //missionTrack = ['NaN','NaN','NaN','NaN','NaN'];
      voteTrack = [0, 0, 0, 0, 0];
      missionTrack = [];
      for (let i = 1; i <= 5; i++) {
        missionTrack.push(missionInfo[i].strength);
      }
      console.log("all members disconnected.")
    }
  });

  //messaging phase
  socket.on('msgFromClient', (message) => {
    messagesArr.push(message); //obj
    io.emit('msgFromServer', messagesArr);
  })

  socket.on('joinUser', (name) => {
    console.log(`${name} connected in`);
  })

  //to be deleted
  socket.on('partyMemClient', (member) => {
    io.emit('partyMemServer', (member));
  })

  //send all the missionMems to client instances
  socket.on('sendMemsClient', (members) => {
    missionMems = [...members];
    io.emit('sendMemsServer', members);
  })

  //vote fo rapproving the team
  socket.on('votingClient', (vote) => votingClient(vote))

  //SABOTAGE phase
  socket.on('missionVote', (vote) => missionVoteFunc(vote))

  //playAgain
  socket.on('playAgain', () => newGame(socket));

  io.emit('users', userCount, users.filter((user) => user.roomid == socket.roomid));
  io.emit('msgFromServer', messagesArr);
})


function votingClient(vote) {
  voteCount++;
  votes.push(vote);

  if (voteCount == users.length - 1) {
    let approvedNo = votes.filter((vote) => vote.vote == true).length;
    //calculate majority votes
    if (approvedNo > (users.length - approvedNo - 1)) {
      //success
      io.emit('votingServer', voteTrack);
      messagesArr = messagesArr.concat(votes);
      io.emit('msgFromServer', messagesArr);
      const memsID = missionMems.map((user) => user.id);
      io.emit('doMission', memsID);
    }
    else {
      //failure
      
        for (let i = 0; i < 5; i++) {
          if (voteTrack[i] == 0) {
            voteTrack[i] = 1; break;//only change the first occurence of 0
          }
        }
        io.emit('votingServer', voteTrack);
        messagesArr = messagesArr.concat(votes);
        io.emit('msgFromServer', messagesArr);

        //check condition for voteTrack -> 5
        if(voteTrack.filter((vote) => vote == 1).length == 5)
        io.emit('winner', 'red');
        else
        nextTurn(500);
    }
  }
}

function missionVoteFunc(vote) {
  missionVote.push(vote); //string
  missionVCount++;
  if (missionVCount == missionMems.length) {
    //no of success vote
    let noOfSuccess = missionVote.filter((vote) => vote == 'success').length;
    //calculating no. of sabotages(failure)
    if (missionMems.length - noOfSuccess >= missionInfo[missionNo].sabotage) {
      redpoint++;
      for (let i = 0; i < 5; i++) {
        if (typeof (missionTrack[i]) == 'number') {
          missionTrack[i] = 'red';
          break;
        }
      }
      io.emit('missionRes', noOfSuccess, 'failure', missionTrack);
      //red wins if it scores 3 points first
      if (redpoint == 3) {
        setTimeout(() => io.emit('winner', 'red'), 3500);
        return;
      }

    }
    else {
      bluepoint++;
      for (let i = 0; i < 5; i++) {
        if (typeof (missionTrack[i]) == 'number') {
          missionTrack[i] = 'blue';
          break;
        }
      }
      io.emit('missionRes', noOfSuccess, 'success', missionTrack);
      //blue wins if it scores 3 points first
      if (bluepoint == 3) {
        setTimeout(() => io.emit('winner', 'blue'), 3500);
        return;
      }

    }
    nextTurn(3500);
  }
}

function nextTurn(delay) {
  //revert to default values for the next turn
  votes = [], voteCount = 0;
  missionVote = [], missionVCount = 0; 

  setTimeout(() => {
    (king < users.length - 1) ? king++ : (king = 0); 
    (missionNo <= 10) ? missionNo++ : null;
    console.log("inside timeout with king: ", king);

    io.emit('nextTurn', users[king].id, missionNo);
  }, delay);
}


function newGame(socket) {
  //revert to default values for the new game
  console.log("new game started")
  messagesArr = [];
  votes = [], voteCount = 0, voteTrack = [0, 0, 0, 0, 0];
  playCount = 0, king = 0;
  missionMems = [];
  missionVote = [], missionVCount = 0, missionNo = 1, bluepoint = 0, redpoint = 0;
  missionTrack = [];
  for (let i = 1; i <= 5; i++) {
    missionTrack.push(missionInfo[i].strength);
  }
  for(let i = 0; i<users.length; i++){
    users[i].role = 'operative';
  }
  king = 0;
  missionNo = 1;

  let random = 0;//use Math.Random logic 
  users[random].role = 'spy';

  io.emit('msgFromServer', messagesArr);
  io.emit('votingServer', voteTrack);
  io.emit('missionRes', null, 'success', missionTrack);
  io.emit('newGame', users[king].id, missionNo, missionInfo);
  io.emit('users', userCount, users.filter((user) => user.roomid == socket.roomid));

}

server.listen(5000, () => { console.log("server started"); });