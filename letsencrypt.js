var nconf = require('nconf');
var path = require('path');
var moment = require('moment');
var LE = require('letsencrypt');


nconf.file({
	file : path.resolve(process.argv[2])
});
nconf.env();

var dns = require('nodetopia-lib/dns');
var mongoose = require('nodetopia-model');
/*
 *Setup mongodb store
 */
mongoose.start(nconf.get('mongodb'));
/*
 *Setup Kue jobs
 */
var kue = require('nodetopia-kue');
var jobs = kue.jobs;


var recoreds = {};

var leChallengeDns = require('le-challenge-dns').create({
	debug : false
});
leChallengeDns.sets = leChallengeDns.set;
leChallengeDns.remove = function(args, domain, challenge, cb) {
	kue.dns.remove(recoreds[domain], function(err) {
		delete recoreds[domain];
		cb(err);
	});
};
leChallengeDns.set = function(args, domain, challenge, keyAuthorization, cb) {
	var keyAuthDigest = require('crypto').createHash('sha256').update(keyAuthorization || '').digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

	recoreds[domain] = {
		type : 'TXT',
		name : '_acme-challenge.' + domain,
		data : keyAuthDigest
	};

	kue.dns.add(recoreds[domain], function(err) {
		if (err) {
			return cb(err);
		}
		setTimeout(cb, 1000)
	});
};

var le = LE.create({
	debug : false,
	server : nconf.get('dns:staging') ? LE.stagingServerUrl : LE.productionServerUrl,
	challengeType : 'dns-01',
	challenges : {
		'dns-01' : leChallengeDns
	},
	log : function(debug) {
		console.log.apply(console, arguments);
	},
	duplicate : nconf.get('dns:staging')
});
le._challengeWarn = false;

function register(opts, tls, done) {
	le.register(opts).then(function(certs) {

		if (tls) {
			Object.keys(certs).forEach(function(key) {
				tls[key] = certs[key];
			});
		} else {
			tls = new mongoose.TLS(certs);
		}

		tls.staging = nconf.get('dns:staging');

		tls.save(function(err) {
			if (err) {
				return done(err);
			}

			done(null, tls);
		});
	}, function(err) {
		console.log(err);
		done(err);
	});
}

jobs.process('le.dns', 999, function(job, done) {
	var domain = job.data.domain.toLowerCase();
	var email = job.data.email.toLowerCase();

	var opts = {
		domains : [domain],
		email : email,
		agreeTos : true,
		duplicate : nconf.get('dns:staging')
	};

	mongoose.TLS.findOne({
		subject : domain
	}, function(err, tls) {
		if (err) {
			return done(err);
		}
		if (tls) {

			if (tls.staging) {
				return register(opts, tls, done);
			}

			var m = moment(tls.expiresAt);
			var today = moment().startOf('day');
			var days = Math.round(moment.duration(m - today).asDays());

			if (days < 30) {
				return register(opts, tls, done);
			}

			return done(null, tls);
		}
		register(opts, tls, done);

	});

});

