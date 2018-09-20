const { Client } = require('pg');
const Chance = require('chance');

const { Options } = require('./options');
const { Generator } = require('./generator');

main();

function main() {
  const options = new Options();
  options.loadFromEnv();

  const client = new Client({
    user: options.pg_user,
    host: options.pg_host,
    database: options.pg_database,
    password: options.pg_password,
    port: options.pg_port,
  });

  const chance = new Chance();

  const generator = new Generator(client, chance);

  return client
    .connect()
    .then(() => {
      return generator.migrate();
    })
    .then(() => {
      return generator.generateData(1000);
    });
}
