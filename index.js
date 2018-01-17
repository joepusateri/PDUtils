// index.js

var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var token;

var request = require('request');
var pdRequest = request.defaults({
  headers: {
    "Content-type": "application/json",
    "Accept": "application/vnd.pagerduty+json;version=2",
    "Authorization": "Token token=" + token
  }
});

var message_type_strings = {
  'incident.trigger': 'triggered',
  'incident.acknowledge': 'acknowledged',
  'incident.escalate': 'escalated',
  'incident.resolve': 'resolved',
  'incident.unacknowledge': 'unacknowledged',
  'incident.assign': 'reassigned',
  'incident.delegate': 'delegated'
};

app.set('port', (process.env.PORT || 5000));

app.use(bodyParser.json());

app.listen(app.get('port'), function() {
  console.log('PDUtils listening on port', app.get('port'));
});

// Wrap


app.post('/wrap', function(req, res) {
  console.log('Starting Wrap');
  token = req.query.token;
  var priorityName = req.query.priority;

  req.body.messages.forEach(function(message) {

    try {
      if (message.log_entries[0].agent.type == 'user_reference') {
        requesterID = message.log_entries[0].agent.id;
        console.log("agent");
        console.log(message.log_entries[0].agent);
      }
    } catch (e) {}

    if (!requesterID) {
      requesterID = req.query.requester_id;
    }

    console.log(message);

    lookupEmail(token, requesterID, priorityName, message.incident.id, req.query.serviceid, message.incident.incident_number, message.incident.title)
  });
  res.end();
});

function lookupEmail(token, userId, priorityName, childIncidentId, serviceId, incidentNo, title) {
  console.log("Looking up email for  %s", userId);

  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token
    },
    uri: "https://api.pagerduty.com/users/" + userId,
    method: 'GET'
  }

  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error getting trigger log entry: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    } else {
      console.log("Retrieved successfully");
      var results = JSON.parse(body);
      var email = results.user.email;
      //console.log("email:" + email)
      getPriorities(token, priorityName, childIncidentId, email, serviceId, incidentNo, title);

    }
  });
}

function getPriorities(token, priorityName, childIncidentId, email, serviceId, incidentNo, title) {
  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token
    },
    uri: "https://api.pagerduty.com/priorities/",
    method: "GET"
  }
  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error getting trigger log entry: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    } else {
      var priorities_obj = JSON.parse(body);
      //console.log(priorities_obj.priorities)
      priorities_obj.priorities.forEach(function(priority) {
        //console.log(priority);
        //console.log(priority.name)
        //console.log(priority.id)
        if (priority.name === priorityName) {
          priorityId = priority.id;
        }
      });
      //console.log("priorityId");
      //console.log(priorityId)
      createIncident(token, priorityId, childIncidentId, priorityName, email, serviceId, incidentNo, title);
    }
  });
}

function createIncident(token, priorityId, childIncidentId, priorityName, fromEmail, serviceId, incidentNo, title) {
  //console.log("fromEmail" + fromEmail)

  //var incidentNo = 456;
  //var incidentTitle = 'Something really cool'
  var body_out = {
    'incident': {
      'type': 'incident',
      'title': 'Resolve Incident #' + incidentNo + ' ' + title,
      'service': {
        'id': serviceId,
        'type': 'service_reference'
      },
      'incident_key': '',
      'body': {
        'type': 'incident_body',
        'details': 'This incident is used to resolve a high priority incident that has been downgraded'
      },
      'priority': {
        'id': priorityId,
        'type': 'priority'
      }
    }
  };

  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token,
      "From": fromEmail
    },
    uri: "https://api.pagerduty.com/incidents/",
    method: 'POST',
    json: body_out
  }

  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error getting trigger log entry: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    } else {
      //console.log(JSON.stringify(body, null, 2));
      var id = body.incident.id;
      console.log("Finished creating incident")
      mergeIncident(token, id, childIncidentId, fromEmail)
    }
  });
}

function mergeIncident(token, parentId, childId, fromEmail) {

  console.log("Merging parent %s to child %s", parentId, childId);
  var body_out = {
    'source_incidents': [{
      'id': childId,
      'type': 'incident_reference'
    }]
  };

  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token,
      "From": fromEmail
    },
    uri: "https://api.pagerduty.com/incidents/" + parentId + "/merge",
    method: 'PUT',
    json: body_out
  }

  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error getting trigger log entry: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    } else {
      console.log("Merged successfully");
    }
  });
}

// Checkin

app.post('/checkin', function(req, res) {
  console.log('Starting Check-in');
  token = req.query.token;
  var priorityName = req.query.priority;

  req.body.messages.forEach(function(message) {

    try {
      if (message.log_entries[0].agent.type == 'user_reference') {
        requesterID = message.log_entries[0].agent.id;
        var name =  message.log_entries[0].agent.summary;
        console.log("agent");
        console.log(name);
        console.log(message.log_entries[0].agent);
      }
    } catch (e) {}

    if (!requesterID) {
      requesterID = req.query.requester_id;
    }

    console.log(message);
    var incidentURL = req.body.messages[0].incident.self;

    lookupEmailForNote(token, requesterID, incidentURL, name + " has checked in to the call");
  });
  res.end();
});

function lookupEmailForNote(token, userId, incidentURL, note) {
  console.log("Looking up email for  %s", userId);

  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token
    },
    uri: "https://api.pagerduty.com/users/" + userId,
    method: 'GET'
  }

  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error getting trigger log entry: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    } else {
      console.log("Retrieved successfully");
      var results = JSON.parse(body);
      var email = results.user.email;
      addNote(token, incidentURL, email, note);

    }
  });
}

function addNote(token, incidentURL, fromEmail, note) {
  var body = {
    "note": {
      "content": note
    }
  };
  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token,
      "From": fromEmail
    },
    uri: incidentURL + "/notes",
    method: "POST",
    json: body
  };
  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error adding note: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    }
  });
}

//clone


app.post('/clone', function(req, res) {
  console.log('Starting Clone');
  token = req.query.token;

  req.body.messages.forEach(function(message) {

    try {
      if (message.log_entries[0].agent.type == 'user_reference') {
        requesterID = message.log_entries[0].agent.id;
        console.log("agent");
        console.log(message.log_entries[0].agent);
      }
    } catch (e) {}

    if (!requesterID) {
      requesterID = req.query.requester_id;
    }

    console.log(message);

    lookupEmailForClone(token, requesterID, message, req.query.serviceid)
  });
  res.end();
});

function lookupEmailForClone(token, userId, message, serviceId) {
  console.log("Looking up email for  %s", userId);

  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token
    },
    uri: "https://api.pagerduty.com/users/" + userId,
    method: 'GET'
  }

  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error getting trigger log entry: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    } else {
      console.log("Retrieved successfully");
      var results = JSON.parse(body);
      var email = results.user.email;
      //console.log("email:" + email)
      createIncidentForClone(token, email, serviceId, message);
    }
  });
}

function createIncidentForClone(token, fromEmail, serviceId, message) {
  //console.log("fromEmail" + fromEmail)

  //var incidentNo = 456;
  //var incidentTitle = 'Something really cool'
  var body_out = {
    'incident': {
      'type': 'incident',
      'title': 'Clone:' + message.incident.incident_number + ' ' + , message.incident.title,
      'service': {
        'id': serviceId,
        'type': 'service_reference'
      },
      'incident_key': '',
      'body': {
        'type': 'incident_body',
        'details': 'This incident is used to resolve a high priority incident that has been downgraded'
      },
      'priority': {
        'id': message.priority.id,
        'type': 'priority'
      }
    }
  };

  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token,
      "From": fromEmail
    },
    uri: "https://api.pagerduty.com/incidents/",
    method: 'POST',
    json: body_out
  }

  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error getting trigger log entry: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    } else {
      //console.log(JSON.stringify(body, null, 2));
      var id = body.incident.id;
      console.log("Finished creating incident")
      mergeIncidentForClone(token, id, message.incident.id, fromEmail)
    }
  });
}

function mergeIncidentForClone(token, parentId, childId, fromEmail) {

  console.log("Merging parent %s to child %s", parentId, childId);
  var body_out = {
    'source_incidents': [{
      'id': childId,
      'type': 'incident_reference'
    }]
  };

  var options = {
    headers: {
      "Content-type": "application/json",
      "Accept": "application/vnd.pagerduty+json;version=2",
      "Authorization": "Token token=" + token,
      "From": fromEmail
    },
    uri: "https://api.pagerduty.com/incidents/" + parentId + "/merge",
    method: 'PUT',
    json: body_out
  }

  request(options, function(error, response, body) {
    if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
      console.log("Error getting trigger log entry: " + error + "\nResponse: " + JSON.stringify(response, null, 2) + "\nBody: " + JSON.stringify(body, null, 2));
    } else {
      console.log("Merged successfully");
    }
  });
}
