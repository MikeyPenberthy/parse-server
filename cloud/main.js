
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