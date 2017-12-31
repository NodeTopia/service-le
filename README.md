# service-le
Letsencrypt DNS service

All jobs that this service use are `kue` processes.

## Run
RUN NOTES:
- This process can be run in the system.
- Can be run as a standalone.
```
node letsencrypt.js /path/to/config/file.json
```


## le.dns
Sets up Letsencrypt through DNS
- `domain` String domain to get TLS for: `my.site.example.com`
- `email` String Email that is used for TOS. Domain must have an `MX` record: `my-site@example.com`