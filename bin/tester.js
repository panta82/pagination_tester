const { Client } = require('pg');
const libDiff = require('diff');

const { Options } = require('../lib/options');
const { UserStore, Criteria } = require('../lib/user_store');

const VARIANTS = 3;
const TARGET_TESTS = 5;

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
      console.log('\nTesting the most basic query, without filters, sorted on PK...');
      return performTest(userStore, new Criteria({ sort_field: 'id' }));
    })
    .then(() => {
      console.log('\nTesting a simple filter, sort by non-unique index');
      return performTest(
        userStore,
        new Criteria({ min_age: 35, sort_field: 'company', sort_direction: 'desc' })
      );
    })
    .then(() => {
      console.log('\nTesting a complex query, sorting on a unique index...');
      return performTest(
        userStore,
        new Criteria({
          filter: 'abc',
          min_age: 50,
          sort_field: 'ssn',
        })
      );
    })
    .finally(() => {
      console.log(`Done`);
      return client.end();
    });
}

function performTest(userStore, criteriaTemplate) {
  return testPage(1);

  function testPage(page) {
    const criteria = new Criteria({ ...criteriaTemplate, page });
    let startedAt;
    process.stdout.write(`    [Page ${String(page).padStart(10)}]`);

    return testVariant(null, 1);

    function testVariant(prevResult, variant) {
      startedAt = new Date();
      return userStore['variant' + variant](criteria).then(
        /** QueryResult */ result => {
          const elapsed = new Date() - startedAt;
          process.stdout.write(` \t V${variant}: ${(elapsed / 1000).toFixed(2)} sec`);

          if (prevResult) {
            const comp1 = { ...prevResult };
            delete comp1.data;
            const comp2 = { ...result };
            delete comp2.data;

            const json1 = JSON.stringify(comp1, null, '  ');
            const json2 = JSON.stringify(comp2, null, '  ');
            if (json1 !== json2) {
              console.log();
              const diff = libDiff.diffLines(json1, json2);
              console.error(`Discrepancy between V${variant - 1} and V${variant}!`);
              diff.forEach(part => {
                const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
                const value = part.value
                  .split('\n')
                  .map(str => prefix + str)
                  .join('\n');
                console.error(value);
              });
              return;
            }
          }

          if (variant < VARIANTS) {
            // Move to next variant
            return testVariant(result, variant + 1);
          }

          // Done with variants
          process.stdout.write('\n');
          const pageSkip = Math.floor(result.total_pages / TARGET_TESTS);
          const nextPage = result.page + pageSkip;
          if (nextPage > result.total_pages) {
            // We are done with pages, exit
            return;
          }

          // Move on to next page to test
          return testPage(nextPage);
        }
      );
    }
  }
}
