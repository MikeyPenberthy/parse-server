var _ = require("underscore");

var PFGroup = Parse.Object.extend("Group");
var PFGroupMember = Parse.Object.extend("GroupMember");
var PFGroupMessage = Parse.Object.extend("GroupMessage");

var twilioAccountSid = 'AC24c43039dabc881d2cfc481b7e4fe222';
var twilioAuthToken = 'bfad414fd3ce8ea685d8867d7dbe2e16';
var twilioPhoneNumber = '+13146268180';

var twilio = require('twilio');
var client = new twilio.RestClient(twilioAccountSid, twilioAuthToken);

var user = new Parse.User();
user.set("username", "my name");
user.set("password", "my pass");
user.set("email", "email@example.com");

// other fields can be set just like with Parse.Object
user.set("phone", "415-392-0202");

user.signUp(null, {
  success: function(user) {
    // Hooray! Let them use the app now.
  },
  error: function(user, error) {
    // Show the error message somewhere and let the user try again.
    alert("Error: " + error.code + " " + error.message);
  }
});

Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});

Parse.Cloud.define("VerifyAccount", function(request, response) {
	var users = Parse.Object.extend('USER');
	var user = new users();
user.set("username", "my name");
user.set("password", "my pass");
user.set("email", "email@example.com");

// other fields can be set just like with Parse.Object
user.set("phone", "415-392-0202");

user.signUp(null, {
  success: function(user) {
    // Hooray! Let them use the app now.
    response.success('yay!');
  },
  error: function(user, error) {
    // Show the error message somewhere and let the user try again.
    alert("Error: " + error.code + " " + error.message);
    response.success(error.code + ": " + error.message);
  }
});
	// var phoneNumber = request.params.phone;
	// var countryCode = request.params.countryCode;
	// var prefix = "+" + countryCode;
	// phoneNumber = phoneNumber.replace(/\D/g, '');

	// // Validate the phone number - US only
	// if (!countryCode) {
	// 	return response.error("Missing country code");
	// }
	// if (!phoneNumber || (phoneNumber.length != 10 && phoneNumber.length != 11)) {
	// 	return response.error('Invalid Parameters');
	// }

	// Parse.Cloud.useMasterKey();
	// var query = new Parse.Query(Parse.User);
	// query.equalTo('username', phoneNumber + "");
	// query.find({
	//   success: function(women) {
	//     // Do stuff
	//     response.success(women);
	//   },
	//   error: function(error) {
 //    	// error is an instance of Parse.Error.
	// 	response.success(error);
	// 	}
	// });
// 	query.first().then(function(result) {
// 		var min = 100; var max = 999;
// 		var num1 = Math.floor(Math.random() * (max - min + 1)) + min;
// 		var num2 = Math.floor(Math.random() * (max - min + 1)) + min;
// 		var token = num1 + " " + num2;
// 		var pass = token.replace(/\D/g, '');
// 		client.messages.create({
// 					to: prefix + phoneNumber,
// 					from: twilioPhoneNumber,
// 					body: 'Your login code for Watch Your BAC is '+ token
// 				}, function(err, responseData) {});
	
	
// });
});


Parse.Cloud.define("login", function(request, response) {
	Parse.Cloud.useMasterKey();

	var phoneNumber = request.params.phone;
	var token = request.params.token;
	if (!phoneNumber || phoneNumber.length != 10) {
		return response.error("Invalid phone number");
	}
	if (!token || token.length === 0) {
		return response.error("Invalid token");
	}
	phoneNumber = phoneNumber.replace(/\D/g, '');
	token = token.replace(/\D/g, '');

	if (phoneNumber && token) {
		var user = null;
		Parse.User.logIn(phoneNumber, token).then(function (loggedInUser) {
			user = loggedInUser;
			// If we are verified, just continue along
			if (user.get("verified") === true) {
				return Parse.Promise.as();
			}
			return pairInvitesToUser(user);
		}).then(function(members) {
			// If we aren't verified, just continue again
			if (user.get("verified") === true) {
				return Parse.Promise.as();
			}
			return user.save({"verified" : true});
		}).then(function(savedUser) {
			response.success(user.getSessionToken());
		}, function (err) {
			response.error(err);
		});
	} else {
		response.error('Invalid parameters.');
	}
});


function sendCodeSms(countryCode, phoneNumber, token) {
	var prefix = "+" + countryCode;
	var promise = new Parse.Promise();
	twilio.messages.create({
		to: prefix + phoneNumber.replace(/\D/g, ''),
		from: twilioPhoneNumber.replace(/\D/g, ''),
		body: 'Your login code for Watch Your BAC is ' + token
	}, function(err, responseData) {
		if (err) {
			console.log(err);
			promise.reject(err.message);
		} else {
			promise.resolve();
		}
	});
	return promise;
}


function pairInvitesToUser(user) {
	Parse.Cloud.useMasterKey();
	var promise = new Parse.Promise();
	var query = new Parse.Query(PFGroupMember);
	query.equalTo("phone", user.get("username"));
	query.doesNotExist("user");
	query.limit(1000);
	query.find().then(function(members) {
		if (members.length === 0) {
			return Parse.Promise.as([]);
		}
		_.each(members, function(member) {
			member.set("user", user);
		});
		return Parse.Object.saveAll(members);
	}).then(function(savedMembers) {
		promise.resolve(savedMembers);
	}, function(err) {
		promise.reject(err);
	});
	return promise;
}

Parse.Cloud.define("SyncContacts", function(request, response) {
	Parse.Cloud.useMasterKey();
	var phones = request.params.phones;
	var query = new Parse.Query(Parse.User);
	query.containedIn("username", phones);
	query.find().then(function(users) {
		var data = [];
		_.each(users, function(user) {
			data.push({
				id : user.id,
				displayName : user.get("displayName"),
				phone : user.get("username")
			});
		});
		response.success(data);
	}, function(err) {
		response.error(err.message);
	});
});

Parse.Cloud.define("CreateGroup", function(request, response) {
	var cUser = request.user;
	if (!cUser) {
		return response.error("You must be logged in to create a group.");
	}
	else if (cUser.get("verified") !== true) {
		return response.error("You must verify your account before creating a group.");
	}
	else if (!cUser.get("displayName") || cUser.get("displayName").length === 0) {
		return response.error("You must set your name before creating groups.");
	}

	var name = request.params.name || "" + cUser.get("displayName") + "'s Group";
	Parse.Cloud.useMasterKey();

	var cMember = null;
	var group = new PFGroup();
	group.set("name", name);
	group.set("createdBy", cUser.id);
	group.set("groupPin", generateGroupPin());

	var groupACL = new Parse.ACL(cUser);
	groupACL.setPublicReadAccess(false);
	groupACL.setPublicWriteAccess(false);
	group.setACL(groupACL);

	var responseData = null;
	group.save().then(function(sGroup) {
		group = sGroup;
		var member = new PFGroupMember();
		member.set("user", cUser);
		member.set("status", "active");
		member.set("group", group);
		member.set("designatedDriver", false);
		member.set("phone", cUser.get("username"));
		return member.save();
	}).then(function(sMember) {
		cMember = sMember;
		var invites = request.params.invites || [];
		return sendGroupInvites(request.user, group, invites, true);
	}).then(function(invitedMembers) {
		var data = {
			"id" : group.id,
			"name" : group.get("name"),
			"groupPin" : group.get("pin"),
			"createdBy" : group.get("createdBy"),
			"updatedAt" : group.updatedAt,
			"createdAt" : group.createdAt,
		};
		var mData = [mergeMember(cMember, true)];
		_.each(group.get("members"), function(member) {
			mData.push(mergeMember(member, false));
		});
		data.members = mData;

		if (invited.length > 0) {
			request.user.increment("invitesSent", invited.length);
			request.user.save().always(function() {
				response.success(data);
			});
		}
		else {
			return Parse.Promise.as();
		}
		response.success(data);
	}, function(err) {
		console.log(err.message);
		response.error("An error occured creating your group.");
	});
});

function generateGroupPin() {
	var pin = "";
    var possible = "0123456789";
    for( var i=0; i < 10; i++ ){
        pin += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return pin;
}

Parse.Cloud.beforeSave("Group", function(request, response) {
	var group = request.object;
	if (group.isNew()) {

	}
	else {

	}
	response.success();
});

Parse.Cloud.beforeDelete("Group", function(request, response) {
	if (!request.master) {
		return response.error("Cannot delete groups");
	}
	Parse.Cloud.useMasterKey();
	var group = request.object;
	var query = new Parse.Query("GroupMember");
	query.equalTo("group", group);
	query.find().then(function(members) {
		if (members.length === 0) {
			return Parse.Promise.as();
		}
		return Parse.Object.destroyAll(members);
	}).then(function() {
		response.success();
	}, function(err) {
		response.error(err);
	});
});




Parse.Cloud.define("GetGroups", function(request, response) {

	if (!request.user) {
		return response.error("You must be logged in to fetch groups");
	}

	Parse.Cloud.useMasterKey();
	var groups = {};

	var cQuery = new Parse.Query(PFGroupMember);
	cQuery.equalTo("user", request.user);
	cQuery.include("group");
	cQuery.find().then(function(cMembers) {
		if (cMembers.length === 0) {
			return Parse.Promise.as([]);
		}
		var gList = [];
		_.each(cMembers, function(member) {
			var g = member.get("group");
			member.set("user", request.user);
			var gData = {
				"id" : g.id,
				"name" : g.get("name"),
				"groupPin" : g.get("pin"),
				"createdBy" : g.get("createdBy"),
				"updatedAt" : g.updatedAt,
				"createdAt" : g.createdAt,
				"members" : [mergeMember(member, true)],
				"lastMessage" : g.get("lastMessage")
			};
			groups[g.id] = gData;
			if (member.get("status") == "active") {
				gList.push(g.toPointer());
		 	}
		});

		var mQuery = new Parse.Query(PFGroupMember);
		mQuery.containedIn("group", gList);
		mQuery.include("user");
		mQuery.notEqualTo("user", request.user);
		mQuery.notEqualTo("status", "invite");
		return mQuery.find();
	}).then(function(members) {
		if (members.length > 0) {
			_.each(members, function(member) {
				var g = groups[member.get("group").id];
				g.members.push(mergeMember(member));
			});
		}
		response.success(_.values(groups));
	}, function(err) {
		response.error(err);
	});
});


Parse.Cloud.define("FetchGroup", function(request, response) {
 	if (!request.user) {
 		return response.error("You must be logged in to fetch a group");
 	}
 	else if (!request.params.groupId) {
 		return response.error("You must supply the id of the group to fetch");
 	}
 	getGroup(request.user, request.params.groupId).then(function(group) {
 		response.success(group);
 	}, function(err) {
 		response.error(err);
 	});
});


function getGroup(currentUser, groupId) {
	Parse.Cloud.useMasterKey();
	var promise = new Parse.Promise();

	var gPointer = new PFGroup();
	gPointer.id = groupId;

	var group = null;
	var cQuery = new Parse.Query(PFGroupMember);
	cQuery.include("group");
	cQuery.equalTo("group", gPointer);
	cQuery.equalTo("user", currentUser);
	cQuery.first().then(function(member) {
		if (member == null || member.get("user").id != currentUser.id) {
			return Parse.Promise.error("You do not have permission to view this group");
		}
		var g = member.get("group");
		member.set("user", currentUser);
		group = {
			"id" : g.id,
			"name" : g.get("name"),
			"groupPin" : g.get("pin"),
			"createdBy" : g.get("createdBy"),
			"updatedAt" : g.updatedAt,
			"createdAt" : g.createdAt,
			"members" : [mergeMember(member, true)],
			"lastMessage" : g.get("lastMessage")
		};

		if (member.get("status") != "active") {
			return Parse.Promise.as([]);
		}
		var mQuery = new Parse.Query(PFGroupMember);
		mQuery.equalTo("group", g);
		mQuery.include("user");
		mQuery.notEqualTo("user", currentUser);
		mQuery.notEqualTo("status", "invite");
		return mQuery.find();
	}).then(function(members) {
		if (members.length > 0) {
			_.each(members, function(member) {
				group.members.push(mergeMember(member));
			});
		}
		promise.resolve(group);
	}, function(err) {
		promise.reject(err.message || err);
	});

	return promise;
}

function mergeMember(member, isCurrentUser) {
	var user = member.get("user");
	var data = {
		"id" : member.id,
		"designatedDriver" : member.get("designatedDriver"),
		"status" : member.get("status"),
		"groupId" : member.get("group").id
	};
	if (isCurrentUser) {
		data.notifications = member.get("notifications");
		data.sharePhoneUntil = member.get("sharePhoneUntil");
		data.shareBacUntil = member.get("shareBacUntil");
		data.shareDrinksUntil = member.get("shareDrinksUntil");
	}

	data.displayName = user.get("displayName");
	data.userId = user.id;
	data.gender = user.get("gender");
	// Only include private data if the member is active
	// May add the ability for the user to manually dictate this (i.e. share for 24hrs)
	if (member.get("status") == "active") {
		var shareBAC = user.get("shareBacUntil");
		var sharePhone = user.get("sharePhoneUntil");
		var now = new Date();
		if (!shareBAC || shareBAC > now) {
			data.lastBAC = user.get("currentBAC");
			data.BACUpdatedAt = user.get("BACUpdatedAt");
			data.goalBAC = user.get("goalBAC");
		}
		if (!sharePhone || sharePhone > now) {
			data.phone = user.get("username");
		}
		data.weight = user.get("weight");
	}
	return data;
}

Parse.Cloud.beforeSave("GroupMember", function(request, response) {

	var member = request.object;
	var user = member.get("user");

	// Make sure we have required fields
	if (!user && !member.get("phone")) {
		return response.error("Group member must have a user or phone");
	}
	else if (!member.get("group")) {
		return response.error("Group member must have a user and group");
	}

	// Set some defaults
	if (!_.isBoolean(member.get("designatedDriver"))) {
		member.set("designatedDriver", false);
	}
	if (!_.isArray(member.get("notifications"))) {
		member.set("notifications", ["message", "member_joined", "member_drink"]);
	}
	member.set("groupId", member.get("group").id);
	// Make sure we have an ACL
	if (!member.getACL()) {
		var acl = new Parse.ACL();
		acl.setPublicWriteAccess(false);
		acl.setPublicReadAccess(false);
		member.setACL(acl);
	}
	if (user) {
		member.getACL().setWriteAccess(user.id, true);
		member.getACL().setReadAccess(user.id, true);
	}
	else {
		member.set("status", "invite");
	}

	// Only the user should have direct write access
	if (!member.isNew()) {
		// Make sure static fields aren't changed
		if (member.dirty("phone") || member.dirty("group")) {
			return response.error("Cannot modify user or group for a group member.");
		}
		else if (member.dirty("user") && (!user || !request.master)) {
			return response.error("Cannot remove the user from a group member");
		}
	}

	response.success();
});

Parse.Cloud.afterSave("GroupMember", function(request, response) {

	var member = request.object;
	if (member.get("status") != "invite") { return; }
	var user = member.get("user");

	if (request.user && user.id == request.user.id) { return; }

	Parse.Cloud.useMasterKey();
	var q = new Parse.Query(PFGroupMember);
	q.include("group");
	q.include("invitedBy");
	q.get(member.id).then(function(fMember) {
		var sender = fMember.get("invitedBy");
		var group = fMember.get("group");
		var senderName = sender.get("displayName")
		var groupName = group.get("name");

		if (user) {
			var notification = senderName + " invited you to join the group " + group.get("name");
			var installQuery = new Parse.Query(Parse.Installation);
			installQuery.equalTo("user", user);
			Parse.Push.send({
				where: installQuery,
				data: {
					alert: notification,
					badge: "Increment",
					title: group.get("name"),
					group: group.id,
					"content-available" : 1,
					action: "group_invite"
				}
			});
		}
		else {
			var msg = senderName + " invited you to join the group " + group.get("name") +" on Watch Your BAC.\n";
			msg += "Already have the app? Just verify you account.\n";
			msg += "iOS: http://appstore.com/watchyourbac";
			return sendInviteSMS(1, member.get("phone"), msg);
		}
	}, function(err) {
		console.log("Error creating invite notification: " + err);
	});

});

function sendInviteSMS(countryCode, phoneNumber, message) {
	var prefix = "+" + countryCode;
	var promise = new Parse.Promise();
	twilio.sendSms({
		to: prefix + phoneNumber.replace(/\D/g, ''),
		from: twilioPhoneNumber.replace(/\D/g, ''),
		body: message
	}, function(err, responseData) {
		if (err) {
			console.log(err);
			promise.reject(err.message);
		} else {
			promise.resolve();
		}
	});
	return promise;
}




// DataManager ONLY
Parse.Cloud.beforeDelete("GroupMember", function(request, response) {
	if (!request.master) {
		return response.error("Cannot delete group members");
	}
	Parse.Cloud.useMasterKey();

	var member = request.object;
	var query = new Parse.Query("GroupMessage");
	query.equalTo("member", member);
	query.limit(1000);
	query.find().then(function(messages) {
		if (messages.length === 0) {
			return Parse.Promise.as();
		}
		return Parse.Object.destroyAll(messages);
	}).then(function() {
		response.success();
	}, function(err) {
		response.error(err);
	});
});


Parse.Cloud.define("SendGroupInvites", function(request, response) {
	var groupID = request.params.groupId;
	var invites = request.params.invites || [];

	if (!request.user) {
		return request.error("You must be logged in to invite people to groups");
	}
	else if (invites.length === 0) {
		return request.error("You must give some people to invite");
	}
	else if (!groupID) {
		return request.error("You must provide a group ID.");
	}

	var gPointer = new PFGroup();
	gPointer.id = groupID;

	var authQuery = new Parse.Query(PFGroupMember);
	authQuery.equalTo("user", request.user);
	authQuery.equalTo("group", gPointer);
	authQuery.first({useMasterKey : true}).then(function(cMember) {
		if (!cMember) {
			return Parse.Promise.error("You are not allowed to send invites for this group");
		}
		return sendGroupInvites(request.user, cMember.get("group"), invites, false);
	}).then(function(invited) {
		if (invited.length > 0) {
			request.user.increment("invitesSent", invited.length);
			request.user.save().always(function() {
				response.success("Sent " + invited.length + " invites.");
			});
		}
		else {
			response.success("No new members to invite");
		}
	}, function(err) {
		response.error(err.message || err);
	});
});


Parse.Cloud.define("AcceptInvite", function(request, response) {
	Parse.Cloud.useMasterKey();

	var cUser = request.user;
	var memberID = request.params.memberId;
	if (!cUser) {
 		return response.error("You must be logged in to fetch a group");
 	}
 	else if (!memberID) {
 		return response.error("You must supply the id of the member to accept");
 	}

	var group = null;
	var originalGroup = null;
	var cQuery = new Parse.Query(PFGroupMember);
	cQuery.include("group");
	cQuery.get(memberID).then(function(member) {
		if (member.get("user").id != cUser.id) {
			return Parse.Promise.error("You do not have permission to accept this invite");
		}
		var g = member.get("group");
		originalGroup = g
		group = {
			"id" : g.id,
			"name" : g.get("name"),
			"groupPin" : g.get("pin"),
			"createdBy" : g.get("createdBy"),
			"updatedAt" : g.updatedAt,
			"createdAt" : g.createdAt,
			"lastMessage" : g.get("lastMessage")
		};

		member.set("status", "active");
		return member.save();
	}).then(function(sMember) {
		sMember.set("user", cUser);
		group.members = [mergeMember(sMember, false)];

		var mQuery = new Parse.Query(PFGroupMember);
		mQuery.equalTo("group", sMember.get("group"));
		mQuery.include("user");
		mQuery.notEqualTo("user", cUser);
		mQuery.notEqualTo("status", "invite");
		return mQuery.find();
	}).then(function(members) {
		if (members.length > 0) {
			_.each(members, function(member) {
				group.members.push(mergeMember(member));
			});
		}
		request.user.increment("invitedAccepted");
		request.user.save().always(function() {
			var memberQuery = new Parse.Query(PFGroupMember);
			memberQuery.equalTo("group", originalGroup);
			memberQuery.equalTo("status", "active");
			memberQuery.exists("user");
			memberQuery.notEqualTo("user", cUser);
			memberQuery.equalTo("notifications", "member_joined");
			var installQuery = new Parse.Query(Parse.Installation);
			installQuery.matchesKeyInQuery("user", "user", memberQuery);
			Parse.Push.send({
				where: installQuery,
				data: {
					alert: cUser.get("displayName") + " joined the group " + group.name,
					title: cUser.get("displayName"),
					group: group.id,
					"content-available" : 1,
					action: "member_joined"
				}
			});
		}).always(function() {
			response.success(group);
		});
	}, function(err) {
		response.error(err.message || err);
	});
});

function sendGroupInvites(sender, group, invites, groupIsNew) {

	var groupMembers = {};
	var phoneNumbers = [];
	var validPhoneLength = 10; // Will need to be dynamic for international support

	// Create  starting list of new members
	_.each(invites, function(invite) {
		var phone = invite.phone;
		if (phone && phone.length == validPhoneLength) {
			var nMember = new PFGroupMember();
			nMember.set("group", group);
			nMember.set("phone", phone);
			nMember.set("status", "invite");
			nMember.set("designatedDriver", false);
			nMember.set("invitedBy", sender);
			groupMembers[phone] = nMember;
			phoneNumbers.push(phone);
			return true;
		}
		return false;
	});

	// No valid invites provided
	if (phoneNumbers.length === 0) {
		return Parse.Promise.as([]);
	}

	// If the group is new we can skip duplicate validation
	// Duplicate new invites, were already hanled by creating the object
	var startPromise = null;
	if (groupIsNew) {
		startPromise = Parse.Promise.as([]);
	}
	else {
		var existingQuery = new Parse.Query(PFGroupMember);
		existingQuery.containedIn("phone", phoneNumbers);
		existingQuery.equalTo("group", group);
		existingQuery.limit = 1000;
		startPromise = existingQuery.find({useMasterKey: true});
	}

	var funcPromise = new Parse.Promise();
	startPromise.then(function(exisingMembers) {
		// Clean out existing members
		_.each(exisingMembers, function(eMember) {
			var p = eMember.get("phone");
			if (eMember.get("status") == "active" || eMember.get("status") == "invite") {
				delete groupMembers[phone];
			}
			// The existing member was removed or left the group. Re-invite
			// Set the id so it is an update not an insert
			else {
				eMember.set("status", "invite");
				groupMembers[phone].id = eMember;
			}
		});
		// No members left to save -> the reject(true) is handled below
		if (Object.keys(groupMembers).length === 0) {
			return Parse.Promise.error(true);
		}

		// Update the phone numbers array
		phoneNumbers = _.map(groupMembers, function(m) {
			return m.get("phone");
		});
		var userQuery = new Parse.Query(Parse.User);
		userQuery.containedIn("username", phoneNumbers);
		return userQuery.find({useMasterKey: true});
	}).then(function(users) {
		// Match users to new members
		console.log("Found users: " + users.length);
		console.log(users);
		console.log(JSON.stringify(groupMembers));
		_.each(users, function(user) {
			var phone = user.get("username");
			console.log("Mathcing user: " + phone);
			var gMember = groupMembers[phone];
			if (gMember) { // Should never happen, but just to be safe
				console.log("Setting user for member invite");
				gMember.set("user", user);
			}
		});

		var membersToSave = _.values(groupMembers);
		return Parse.Object.saveAll(membersToSave, { useMasterKey: true });
	}).then(function(savedMembers) {
		funcPromise.resolve(savedMembers);
	}, function(err) {
		if (err === true) {
			funcPromise.resolve([]);
		}
		else {
			funcPromise.reject(err);
		}
	});
	return funcPromise;
}
/********************************************************************************
* Group Messages
/********************************************************************************/

Parse.Cloud.beforeSave("GroupMessage", function(request, response) {
	var msg = request.object;
	if (!msg.get("message")) {
		return response.error("Group message must have a message");
	}
	else if (!msg.get("member")) {
		return response.error("Group message must have a member");
	}
	else if (!msg.get("type")) {
		return response.error("Group message must have a type");
	}
	response.success();
});

Parse.Cloud.afterSave("GroupMessage", function(request, response) {
	var message = request.object;
	var groupId = message.get("groupId");
	if (message.existed()) { return; }
	if (!groupId) { return; }
	if (message.get("type") != "message") { return; }

	Parse.Cloud.useMasterKey();

	var gPointer = new PFGroup();
	gPointer.id = groupId;

	// If this is a message update the group with it.
	console.log("Message type: " + message.get("type"));
	if (message.get("type") == "message") {
		gPointer.set("lastMessage", {
			"sentAt" : message.createdAt,
			"message" : message.get("message")
		});
		gPointer.save();
	}

	// Send notifications
	var q = new Parse.Query(PFGroupMember);
	q.include("group");
	q.include("user");
	q.get(message.get("member").id).then(function(member) {
		var sender = member.get("user");
		var group = member.get("group");

		var msgType = message.get("type");

		var username = sender.get("displayName");
		var msg = message.get("message");

		var notification = "";
		if (msgType == "message") {
			notification = username +" in " + group.get("name") + ": " + msg;
		}

		var memberQuery = new Parse.Query(PFGroupMember);
		memberQuery.equalTo("notifications", msgType);
		memberQuery.equalTo("status", "active");
		memberQuery.exists("user");
		memberQuery.equalTo("group", group);
		memberQuery.notEqualTo("user", sender);

		var installQuery = new Parse.Query(Parse.Installation);
		installQuery.matchesKeyInQuery("user", "user", memberQuery);

		Parse.Push.send({
			where: installQuery,
			data: {
				alert: notification,
				badge: "Increment",
				title: username,
				group: groupId,
				"content-available" : 1,
				action: "group_message"
			}
		});
	}, function(err) {
		console.log("Error creating message notification: " + err);
	});
});

Parse.Cloud.define("PostGroupMessage", function(request, response) {
	Parse.Cloud.useMasterKey();
	var groupId = request.params.groupId;
	var content = request.params.message;
	var msgType = request.params.messageType || "message";

	if (!request.user)  {
		return response.error("You must be logged in to send group messages");
	}
	else if (!groupId) {
		return response.error("You must supply the id of the group to post in");
	}
	else if (!content || content.length === 0) {
		return response.error("You didn't enter a message");
	}

	var gPointer = new PFGroup();
	gPointer.id = groupId;

	var memQuery = new Parse.Query(PFGroupMember);
	memQuery.equalTo("group", gPointer);
	memQuery.equalTo("user", request.user);
	memQuery.equalTo("status", "active");
	memQuery.first().then(function(member) {
		if (!member) {
			return Parse.Promise.error("You are not an active member of this group");
		}
		var msg = new PFGroupMessage();
		msg.set("message", content);
		msg.set("member", member);
		msg.set("type", msgType);
		msg.set("groupId", groupId);
		return msg.save();
	}).then(function(message) {
		message.get("member").set("user", request.user);
		var res = mergeMessage(message, true);
		response.success(res);
	}, function(err) {
		response.error(err.message || err);
	});
});

Parse.Cloud.define("GetGroupMessages", function(request, response) {
	Parse.Cloud.useMasterKey();
	var groupId = request.params.groupId;

	if (!request.user)  {
		return response.error("You must be logged in to get group messages");
	}
	else if (!groupId) {
		return response.error("You must supply a group id you want messages for");
	}

	var gPointer = new PFGroup();
	gPointer.id = groupId;

	var memQuery = new Parse.Query(PFGroupMember);
	memQuery.equalTo("group", gPointer);
	memQuery.equalTo("user", request.user);
	memQuery.equalTo("status", "active");

	var msgQuery = new Parse.Query(PFGroupMessage);
	msgQuery.matchesKeyInQuery("groupId", "groupId", memQuery);
	msgQuery.include("member.user");
	msgQuery.find().then(function(messages) {
		var res = _.map(messages, function(msg) {
			var user = msg.get("member").get("user");
			return mergeMessage(msg, user.id == request.user.id);
		});
		response.success(res);
	}, function(err) {
		response.error(err.message);
	});
});

function mergeMessage(message, isCurrentUser) {
	return {
		"id" : message.id,
		"message" : message.get("message"),
		"sentAt" : message.createdAt,
		"type" : message.get("type"),
		"member" : mergeMember(message.get("member"), isCurrentUser)
	};
}



Parse.Cloud.define("PostDrink", function(request, response) {
	Parse.Cloud.useMasterKey();

	var user = request.user;
	if (!user) {
		return response.error("You must be logged in to post drinks");
	}
	else if (!user.get("verified")) {
		return response.error("You must be verify your account to post drinks");
	}

	var bac = 0;
	var cBAC = user.get("currentBAC");
	var lastDrink = user.get("BACUpdatedAt");
	if (cBAC > 0 && lastDrink !== null) {
		var now = new Date().getTime();
		var mSecs = now - lastDrink.getTime();

		var hours = mSecs/1000.0/60.0/60.0;
		var decAmount = hours * 0.015;
		bac = cBAC - decAmount;
		if (bac < 0) {
			bac = 0;
		}
	}

	var passedGoal = false;
	var goal = user.get("goalBAC") || 0;
	if (goal > 0) {
		passedGoal = bac > goal;
	}

	var query = null;

	var drinkQuery = new Parse.Query(PFGroupMember);
	drinkQuery.greaterThan("shareDrinksUntil", new Date());

	if (passedGoal) {
		var bacLimitedQuery = new Parse.Query(PFGroupMember);
		bacLimitedQuery.greaterThan("shareBacUntil", new Date());

		var bacForeverQuery = new Parse.Query(PFGroupMember);
		bacForeverQuery.doesNotExist("shareBacUntil");

		var bacQuery = Parse.Query.or(bacLimitedQuery, bacForeverQuery);
		query = Parse.Query.or(bacQuery, drinkQuery);
	}
	else {
		query = drinkQuery;
	}

	query.equalTo("status", "active");
	query.equalTo("user", request.user);
	query.find().then(function(members) {

		// Arrays of the groups to share with
		var shareDrinkWith = [];
		var shareGoalPassWith = [];
		var now = new Date();
		_.each(members, function(member) {
			var group = member.get("group");
			var shareBAC = member.get("shareBacUntil");
			var shareDrinks = member.get("shareDrinksUntil");

			if (passedGoal == true) {
				if (!shareBAC || shareBAC > now) {
					shareGoalPassWith.push(group);
				}
			}
			if (shareDrinks && shareDrinks > now) {
				shareDrinkWith.push(group);
			}
		});

		return Parse.Promise.when([
			shareDrink(user, shareDrinkWith, request.params.drinkName),
			shareGoalPass(user, shareGoalPassWith)
		]);

	}).then(function() {
		response.success("Shared drink");
	}, function(err) {
		response.error(err.message);
	});
});


function shareGoalPass(user, groups) {

	console.log("Sharing goal pass with " + groups.length + " groups.");
	if (groups.length === 0) {
		return Parse.Promise.as();
	}

	var message = user.get("displayName") + " passed their goal!";

	var memQuery = new Parse.Query(PFGroupMember);
	memQuery.containedIn("group", groups);
	memQuery.equalTo("notifications", "member_passed_goal");
	memQuery.equalTo("status", "active");

	var iQuery = new Parse.Query(Parse.Installation);
	iQuery.matchesKeyInQuery("user", "user", memQuery);
	iQuery.notEqualTo("user", user);

	return Parse.Push.send({
			where: iQuery,
			data: {
				alert: message
			}
		});
}

function shareDrink(user, groups, drinkName) {

	console.log("Sharing drink with " + groups.length + " groups.");
	if (groups.length === 0) {
		return Parse.Promise.as();
	}

	var dName = drinkName || "drink";
	var message = user.get("displayName") + " had a " + dName;

	var memQuery = new Parse.Query(PFGroupMember);
	memQuery.containedIn("group", groups);
	memQuery.equalTo("notifications", "member_drink");
	memQuery.equalTo("status", "active");

	var iQuery = new Parse.Query(Parse.Installation);
	iQuery.matchesKeyInQuery("user", "user", memQuery);
	iQuery.notEqualTo("user", user);

	return Parse.Push.send({
			where: iQuery,
			data: {
				alert: message
			}
		});
}




Parse.Cloud.define("joinGroup", function(request, response) {
	if (!request.user) {
		response.error("You must be logged in to join a group.");
		return;
	}

	Parse.Cloud.useMasterKey();
	var q = new Parse.Query(PFGroup);
	q.equalTo("groupPin", request.params.code);
	q.first().then(function(group) {
		if (group) {
			console.log(result);
			var newMember = new PFGroupMember();
			newMember.set('user', request.user);
			newMember.set('group', group);
			newMember.set('status', 'active');
			newMember.set('notifications', true);
			newMember.save().then(function(sMember) {

				var mQuery = new Parse.Query(PFGroupMember);
				mQuery.equalTo("group", group);
				mQuery.include("user");
				return mQuery.find({useMasterKey: true});
			}).then(function(members) {
				var merged = _.map(members, function(m) {
					return mergeMember(m);
				});
				group.set("members", merged);
				response.success(group);
			}, function(err) {
				console.log(err);
				response.error(err.message);
			});
		}
		else {
			response.error("Code did not match the event.");
		}
	}, function(error) {
		response.error("There was a problem verifing this passcode");
	});
});


Parse.Cloud.define("MigrateRecipes", function(request, response) {

	var PFCocktail = Parse.Object.extend("Recipes");
	var PFMocktail = Parse.Object.extend("Mocktails");
	var PFRecipe = Parse.Object.extend("Recipe");

	var query = new Parse.Query(PFMocktail);
	query.find().then(function(mocktails) {

		var recipes = [];
		_.each(mocktails, function(m) {
			var recipe = new PFRecipe();
			recipe.set("name", m.get("recipeName"));
			recipe.set("ingredients", m.get("ingredients"));
			recipe.set("type", "mocktail");
			recipes.push(recipe);
		});

		return Parse.Object.saveAll(recipes);
	}).then(function() {
		return new Parse.Query(PFCocktail).find();
	}).then(function(cocktails) {

		var recipes = [];
		_.each(cocktails, function(c) {
			var recipe = new PFRecipe();
			recipe.set("name", c.get("recipeName"));
			recipe.set("ingredients", c.get("ingredients"));
			recipe.set("type", "cocktail");
			recipes.push(recipe);
		});
		return Parse.Object.saveAll(recipes);
	}).then(function() {
		response.success("Combined recipes!");
	}, function(err) {
		response.error(err.message);
	});
});


Parse.Cloud.job("MigrateAchievement", function(request, status) {
	Parse.Cloud.useMasterKey();

	var query = Parse.Query(Parse.User);
	query.exists("achievementTracker");
	query.include("achievementTracker");
	query.each(function(user) {
		var tracker = user.get("achievementTracker");
		if (!tracker) {
			return Parse.Promise.as();
		}

		if (tracker.get("appRunTime")) {
			user.increment("appRunTime", tracker.get("appRunTime"));
		}
		if (tracker.get("appRunTimeLevel")) {
			user.increment("appRunTimeLevel", tracker.get("appRunTimeLevel"));
		}
		if (tracker.get("underLimit")) {
			user.increment("stayedGreen", tracker.get("underLimit"));
		}
		return user.save();
	}).then(function() {
		status.success("Migrated user achievements");
	}, function(err) {
		status.error("Error migrating achievements " + err.message);
	});
});


Parse.Cloud.job("AnalyzeGroups", function(request, response) {

	var q = new Parse.Query(PFGroup);
	q.find().then(function(res) {

		console.log("Found " + res.length + " Groups");
		var count = 0;
		for (var i = 0; i < res.length-1; i++) {
			var g = res[i];
			if (g.get("members").length > 1){
				count++;
			}
		}

		response.success("There are " + count + " groups with more than 1 person");
	}, function(err) {
		response.error(err.message);
	});
});
