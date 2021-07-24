const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require('mongoose');
const fs = require('fs');
const config = require("config.json");

const app = express();
app.use(express.json({type : "application/*"}));

mongoose.connect("mongodb+srv://admin-fatima:black123@cluster0.3btrc.mongodb.net/AttendancegpDB", {useNewUrlParser: true});

const studentsSchema = {
  _id: String,
  studentName: String,
  accountPassword: String,
  MACAddress: String,
  attendedCoursesIDs: {
    type: Array,
    "default": []
  }
};
const Student = mongoose.model("Student", studentsSchema);

const coursesSchema = {
  _id: String,
  courseName: String,
  lecturesIDs: {
    type: Array,
    "default": []
  },
  studentsIDs: {
    type: Array,
    "default": []
  }
};
const Course = mongoose.model("Course", coursesSchema);

const lecturesSchema = {
  _id: String,
  courseID: String,
  lectureTime: Number
};
const Lecture = mongoose.model("Lecture", lecturesSchema);

const attednacesSchema = {
  _id: String,
  courseID: String,
  lectureID: String,
  studentID: String,
  timeInLecture: Number,
  hasAttended: Boolean
};

const Attendance = mongoose.model("Attendance", attednacesSchema);

const tempSchema = {
  _id: Number,
  studentsID: String,
  lectureID: String,
  timeSpentInLecture: Number
}

const Temp = mongoose.model("Temp", tempSchema);

const macSchema = {
  _id: String,
  macAddress: String
}
const Mac = mongoose.model("Mac", macSchema);


////////////////////////////////////////////Golbal Variables////////////////////////////////////////////////
   var tempID = "0";
   var lecTime = 0;
   var mac = [];
////////////////////////////////////////////Functions////////////////////////////////////////////////

// function to generate Lecture ID
function generateLecID(courseID,foundCourse) {
      var courseLecIDs= foundCourse.lecturesIDs;
      var courseLecIDsLen =courseLecIDs.length;
      var lastLecID= courseLecIDs[courseLecIDsLen - 1];
      var lastLecIDLen = lastLecID.length;
      var lecNumber= lastLecID.slice(lastLecIDLen - 1, lastLecIDLen);
      lecNumber++;
      var newLecID = courseID.replace(/[^a-zA-Z0-9]/g, '') + "_" + lecNumber;
      return (newLecID);
};

// Function to create Student Object to push Students in the Temporary table that is created while the session is running for the attendence
 async function createTempObject(studentsInCourse, tempID, lecID) {
   try{
     for (var i = 0; i < studentsInCourse.length; i++)
     {
       const studentsRegisteredInCourse = new Temp({
       _id: tempID,
       studentsID: studentsInCourse[i]._id,
       lectureID: lecID,
       timeSpentInLecture: 0
       });
        await studentsRegisteredInCourse.save();
        tempID++;
     }
  }
    catch(error){
      console.log(error);
    }
 }

// Creating the Temporary Attendence Table while the session is running
 async function fillingTempTable(courseID) {
   try{
       const courseFound = await Course.findOne({_id: courseID});
       const lecID = generateLecID(courseID,courseFound);
       await Course.updateOne({_id: courseID}, {$push: {lecturesIDs: lecID}});
       const studentsInCourse = await Student.find({attendedCoursesIDs:{$elemMatch:{courseID: courseID}}});
       createTempObject(studentsInCourse, tempID, lecID);
     }catch(error){
       console.log(error);
     }
   };

async function updatingLectureTable(courseID) {
  try{
  const foundCourse = await Course.findOne({_id: courseID});
  var courseLecIDs= foundCourse.lecturesIDs;
  var courseLecIDsLen =courseLecIDs.length;
  var lastLecID= courseLecIDs[courseLecIDsLen - 1];
  const newLec = new Lecture({
    _id: lastLecID,
    courseID: courseID,
    lectureTime: lecTime
  });
  await newLec.save();
}catch(error){
  console.log(error);
}
}

//Main taking Attendance function
async function TakingAttendence(courseID) {
  try{
    const macObjects = await Mac.find({});
    var macAddresses = [];
    for (var i = 0; i < macObjects.length; i++) {
      macAddresses[i] = macObjects[i].macAddress;
    }
   const allStudentsInCourse = await Student.find({attendedCoursesIDs:{$elemMatch:{courseID: courseID}}});
   for (var i = 0; i < allStudentsInCourse.length; i++) {
     var check = macAddresses.includes(allStudentsInCourse[i].MACAddress);
     if (check) {
       await Temp.updateOne({studentsID: allStudentsInCourse[i]._id}, {$inc: {timeSpentInLecture:5}});
     }
     else {
       continue;
    }
  }
}catch(error){
    console.log(error);
  }
}

async function UpdateAttendance(courseID, minTimeSpentInLecture) {
  try{
  const dataInTemp = await Temp.find({});
  for (var i = 0; i < dataInTemp.length; i++) {
    const stdAttendance = new Attendance ({
      _id: mongoose.Types.ObjectId(),
      courseID: courseID,
      lectureID: dataInTemp[i].lectureID,
      studentID: dataInTemp[i].studentsID,
      timeInLecture: dataInTemp[i].timeSpentInLecture,
      hasAttended: (dataInTemp[i].timeSpentInLecture >= minTimeSpentInLecture)? true : false
    });
    await Attendance.create(stdAttendance);
  }
  await Temp.deleteMany({});
  console.log("FINISHHH");
}catch(error){
    console.log(error);
  }
}


async function SessionDuration(courseID, minTimeSpentInLecture, end) {
  try{

    const lecInterval = setInterval(async function(){
      await TakingAttendence(courseID);
      lecTime++;
      console.log(lecTime);
      if (lecTime <= end){
        clearInterval(lecInterval);
        await UpdateAttendance(courseID, minTimeSpentInLecture);
        await updatingLectureTable(courseID,lecTime);
      }
  }, 10000);
}catch(error){
  console.log(error);
}
}

async function attendance(courseID, minTimeSpentInLecture, end) {
  try {
    await fillingTempTable(courseID);
   await SessionDuration(courseID, minTimeSpentInLecture, end);
  } catch (e) {
    console.log(e);
  }
}

////////////////////////////////////////////Main////////////////////////////////////////////////

app.post("/sendingMacAdresses", async function(req, res) {
  try {
    const macAddresses =req.body.MACAddresses;
    await Mac.deleteMany({});
    for (var i = 0; i < macAddresses.length; i++) {
      const macAdd = new Mac ({
        _id:mongoose.Types.ObjectId(),
        macAddress: macAddresses[i]
      });
      await Mac.create(macAdd);
    }
  } catch (e) {
    console.log(e);
  }
});

app.post("/session",async function(req, res) {
  try{
    const courseID= req.body.courseID;
    const minTimeSpentInLecture = req.body.minTimeSpentInLecture;
    const end = req.body.endSession;
    await attendance(courseID, minTimeSpentInLecture, end)
}catch(error){
    console.log(error);
  }
});

app.get("/signIn/:MACaddress/:studentID/:password", async function (req, res) {
  try {
    const macAddress = req.params.MACaddress;
    const studentID = req.params.studentID;
    const studentAccountPassword = req.params.password;
    await Student.findOne({_id: studentID, accountPassword: studentAccountPassword}, function (err, foundStd) {
      if(!foundStd){console.log("Student not registered");}
      else {
        if (foundStd.MACAddress == null){
          foundStd.MACAddress = macAddress;
          foundStd = JSON.stringify(foundStd);
          res.json(foundStd);
        }else{
          res.json(foundStd);
      }
      }
    });
  } catch (e) {
    console.log(e);
  }
});

app.get("/logIn/:studentID/:password", async function (req, res) {
  try {
    const studentID = req.params.studentID;
    const studentAccountPassword = req.params.password;
    await Student.findOne({_id: studentID, accountPassword: studentAccountPassword}, function (err, foundStd) {
      if(!foundStd){console.log("Student not registered");}
      else {
          res.json(foundStd);
      }
    });
  } catch (e) {
    console.log(e);
  }
});

app.get("/studentPerformance/:courseID/:studentID", async function (req, res) {
  try {
    const courseID = req.params.courseID;
    const studentID = req.params.studentID;
    await Attendance.find({courseID: courseID, studentID: studentID}, function (err, foundAttendance) {
      if(!foundAttendance){console.log("No data is found");}
      else {
        res.json(foundAttendance);
      }
    });
  } catch (e) {
    console.log(e);
  }
});

/////////////////////////////Console App///////////////////

app.get("/coursePerformance/:courseID", async function (req, res) {
  try {
    const courseID = req.params.courseID;
    await Attendance.find({courseID: courseID}, function (err, foundAttendance) {
      if(!foundAttendance){console.log("No data is found");}
      else {
        res.json(foundAttendance);
      }
    });
  } catch (e) {
    console.log(e);
  }
});

const port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Server has started");
});
