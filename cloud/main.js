
Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});

Parse.Cloud.define("VerifyAccount", function(request, response) {
	var phoneNumber = request.params.phone;
	var countryCode = request.params.countryCode;
	phoneNumber = phoneNumber.replace(/\D/g, '');

	// Validate the phone number - US only
	if (!countryCode) {
		return response.error("Missing country code");
	}
	if (!phoneNumber || (phoneNumber.length != 10 && phoneNumber.length != 11)) {
		return response.error('Invalid Parameters');
	}

	Parse.Cloud.useMasterKey();
	var query = new Parse.Query(Parse.User);
	query.equalTo('username', phoneNumber + "");
	query.first().then(function(result) {
		var min = 100; var max = 999;
		var num1 = Math.floor(Math.random() * (max - min + 1)) + min;
		var num2 = Math.floor(Math.random() * (max - min + 1)) + min;
		var token = num1 + " " + num2;
		var pass = token.replace(/\D/g, '');

		if (result) {
			console.log("Verifying existing user");
			result.setPassword(pass);
			result.save().then(function() {
				return sendCodeSms(countryCode, phoneNumber, token);
			}).then(function() {
				response.success();
			}, function(err) {
				response.error(err);
			});
		}
		else {
			var user = (request.user && !request.user.get("verified")) ? request.user
				: new Parse.User();

			user.setUsername(phoneNumber);
			user.setPassword(pass);
			user.save().then(function(a) {
				return sendCodeSms(countryCode, phoneNumber, token);
			}).then(function() {
				response.success();
			}, function(err) {
				response.error(err);
			});
		}
	}, function (err) {
		response.error(err);
	});
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
	twilio.sendSms({
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