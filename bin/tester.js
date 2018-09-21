const { Client } = require('pg');
const libDiff = require('diff');

const { Options } = require('../lib/options');
const { UserStore, Criteria } = require('../lib/user_store');

main().catch(err => {
  console.error(err);
  process.exit(1);
});

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

  const userStore = new UserStore(client);

  return client
    .connect()
    .then(() => {
      console.log('Testing...');
      return testPage(1);
    })
    .finally(() => {
      console.log(`Done`);
      return client.end();
    });

  function testPage(page = 1) {
    const criteria = new Criteria({ page });
    let startedAt = new Date();
    process.stdout.write(`    [Page ${page}]`);

    return userStore.listV1(criteria).then(result1 => {
      const elapsed = new Date() - startedAt;
      process.stdout.write(` V1: ${(elapsed / 1000).toFixed(2)} sec`);

      startedAt = new Date();
      return userStore.listV2(criteria).then(result2 => {
        const elapsed = new Date() - startedAt;
        process.stdout.write(` V2: ${(elapsed / 1000).toFixed(2)} sec\n`);

        const json1 = JSON.stringify(result1, null, '  ');
        const json2 = JSON.stringify(result2, null, '  ');
        if (json1 !== json2) {
          const diff = libDiff.diffLines(json1, json2);
          console.error(`Discrepancy!`);
          diff.forEach(part => {
            console.error(part.added ? '+ ' : part.removed ? '- ' : '  ', part.value);
          });
        }

        if (page < result2.total_pages) {
          return testPage(page + 1);
        }
      });
    });
  }
}
