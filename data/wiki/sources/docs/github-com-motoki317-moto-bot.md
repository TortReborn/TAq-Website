---
id: github-com-motoki317-moto-bot
url: https://github.com/motoki317/moto-bot
kind: repo
title: "GitHub - motoki317/moto-bot: Discord bot for Wynncraft utility commands! (version 2, refactored) · GitHub"
fetched_at: 2026-09-03T07:05:57.408Z
raw_sha256: 0ed37aa51ae3fb98
note: "motoki317/moto-bot — Wynncraft utility Discord bot, 576 commits, archived read-only 27 Jan 2024. Establishes motoki317 is NOT the titantimes/valor author (our notes conflated them)"
---

This repository was archived by the owner on Jan 27, 2024. It is now read-only.

motoki317

/

moto-bot

Public archive

-
Notifications
You must be signed in to change notification settings

-
Fork
2

-

Star
6

-

Code

-

Issues
0

-

Pull requests
10

-

Actions

-

Projects

-

Security and quality
0

-

Insights

Additional navigation options

-

Code

-

Issues

-

Pull requests

-

Actions

-

Projects

-

Security and quality

-

Insights

master

Branches Tags

Go to file

Code Open more actions menu

Latest commit

History
576 Commits
576 Commits

Folders and files
Name Name Last commit message
Last commit date

.github

.github

.idea

.idea

mysql/ init

mysql/ init

src

src

.dockerignore

.dockerignore

.env-sample

.env-sample

.gitignore

.gitignore

Dockerfile

Dockerfile

LICENSE

LICENSE

Makefile

Makefile

README.md

README.md

docker-compose.dev.yml

docker-compose.dev.yml

docker-compose.yml

docker-compose.yml

pom.xml

pom.xml

View all files

Repository files navigation
-
- README
- MIT license

More items

moto-bot

[image: ]
[image: ]
[image: ]

A discord bot for Wynncraft utility commands, written in Java using JDA.

See usage (old v1 info):
https://forums.wynncraft.com/threads/223425/

Development

Some useful shortcuts for development are written in Makefile .

- make build to (re-)build the image and launch the bot.

- make up to launch the bot (does not rebuild the image).

- make down to stop the bot and DB.

For debugging:

- make db-up to launch only the DB container.

- make db to connect to DB (password: password ).

- mvn test to run tests. DB container needs to be launched.

Production

You can either manually build and install the bot, or pull image from the release.
Using docker might be easier but overheads could be a problem in small servers.

Manual Installation

Manual build and installation (does not use docker)

- Clone this repository.

- Install correct version of MariaDB (see docker-compose.yaml at root).

- Execute sql files in mysql/init directory.

- Set these environment variables for the bot.

- PORT ... Server port. Exposes Prometheus metrics on /metrics .

- DISCORD_ACCESS_TOKEN ... Discord bot account access token

- BOT_DISCORD_ID ... Discord user ID of the bot

- BOT_LOG_CHANNEL_0 ~ BOT_LOG_CHANNEL_4 ... Discord channel IDs to which bot sends logs

- PLAYER_TRACKER_CHANNEL ... Discord channel ID to which bot sends player number logs once a day

- BOT_RESTART_CHANNEL ... Discord channel ID to which bot sends a log on every restart

- MYSQL_HOST ... MariaDB host name

- MYSQL_PORT ... MariaDB port

- MYSQL_DATABASE ... MariaDB database name

- MYSQL_USER ... MariaDB username

- MYSQL_PASSWORD ... MariaDB password for the given username

- Install maven (see Dockerfile at root for version).

- Build, and launch the bot.

mvn clean package -D skipTests
./target/bin/main

Docker Installation

- Clone this repository, or copy the root docker-compose.yaml and mysql/init directory since only these files are required.

- Create a file named .env and set environment variables (see .env-sample ).

- Execute docker-compose up -d .

About
Discord bot for Wynncraft utility commands! (version 2, refactored)
discord.gg/hdKfEeV
Topics
bot discord discord-bot minecraft wynncraft
Resources
Readme
MIT license
Activity
Stars
6 stars
Watchers
1 watching
Forks
2 forks
Report repository

Releases

Packages

Used by

Contributors

Languages
