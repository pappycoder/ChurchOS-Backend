const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { Octokit } = require('@octokit/rest');
const { graphql } = require('@octokit/graphql');

const ORG_NAME = process.env.ORG_NAME || 'pappycoder';
const PROJECT_NUMBER = parseInt(process.env.PROJECT_NUMBER || '2', 10);
const CSV_PATH = process.env.CSV_PATH || 'churchos_github_projects_import.csv';

if (!process.env.GH_PAT) {
  console.error('Error: GH_PAT environment variable is required.');
  process.exit(1);
}

const octokit = new Octokit({ auth: process.env.GH_PAT });

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `Bearer ${process.env.GH_PAT}`,
  },
});

const repos = {
  'ChurchOS-Backend': { owner: ORG_NAME, repo: 'ChurchOS-Backend' },
  'ChurchOS-Web': { owner: ORG_NAME, repo: 'ChurchOS-Web' },
  'ChurchOS-Mobile': { owner: ORG_NAME, repo: 'ChurchOS-Mobile' },
};

/**
 * Fetch project metadata including custom fields
 */
async function getProjectMetadata() {
  const query = `
    query($org: String!, $number: Int!) {
      organization(login: $org) {
        projectV2(number: $number) {
          id
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }
  `;

  const result = await graphqlWithAuth(query, { org: ORG_NAME, number: PROJECT_NUMBER });
  const project = result.organization.projectV2;

  if (!project) {
    throw new Error(`Project #${PROJECT_NUMBER} not found in organization ${ORG_NAME}`);
  }

  const fields = {};
  for (const field of project.fields.nodes) {
    fields[field.name] = {
      id: field.id,
      options: field.options || [],
    };
  }

  return { projectId: project.id, fields };
}

/**
 * Create a single-select custom field if it doesn't exist
 */
async function createCustomFieldIfMissing(projectId, fields, fieldName, options) {
  if (fields[fieldName] && fields[fieldName].options.length > 0) {
    console.log(`Field "${fieldName}" already exists.`);
    return fields[fieldName];
  }

  console.log(`Creating field "${fieldName}"...`);

  const mutation = `
    mutation($projectId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
      createProjectV2Field(
        input: {
          projectId: $projectId
          dataType: SINGLE_SELECT
          name: $name
          singleSelectOptions: $options
        }
      ) {
        projectV2Field {
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
        }
      }
    }
  `;

  const optionInputs = options.map((name) => ({
    name,
    color: 'GRAY',
    description: '',
  }));

  const result = await graphqlWithAuth(mutation, {
    projectId,
    name: fieldName,
    options: optionInputs,
  });

  return {
    id: result.createProjectV2Field.projectV2Field.id,
    options: result.createProjectV2Field.projectV2Field.options,
  };
}

/**
 * Add an issue to the project
 */
async function addIssueToProject(projectId, contentId) {
  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item {
          id
        }
      }
    }
  `;

  const result = await graphqlWithAuth(mutation, { projectId, contentId });
  return result.addProjectV2ItemById.item.id;
}

/**
 * Update a single-select custom field on a project item
 */
async function updateProjectField(projectId, itemId, fieldId, optionId) {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `;

  await graphqlWithAuth(mutation, { projectId, itemId, fieldId, optionId });
}

/**
 * Find existing issue by partial title match
 */
async function findExistingIssue(owner, repo, title) {
  try {
    // GitHub search has rate limits, so we list recent issues
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      per_page: 100,
    });

    return issues.find((issue) => issue.title.includes(title));
  } catch (error) {
    console.error(`Error searching issues in ${repo}:`, error.message);
    return null;
  }
}

/**
 * Main execution
 */
async function run() {
  console.log('Loading CSV...');
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found: ${CSV_PATH}`);
  }

  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(csv, { columns: true, skip_empty_lines: true });
  console.log(`Loaded ${rows.length} rows from CSV.`);

  console.log('Fetching project metadata...');
  const { projectId, fields } = await getProjectMetadata();
  console.log(`Found project ID: ${projectId}`);

  console.log('Ensuring custom fields exist...');
  const repositoryField = await createCustomFieldIfMissing(projectId, fields, 'Repository', [
    'ChurchOS-Backend',
    'ChurchOS-Web',
    'ChurchOS-Mobile',
  ]);

  const phaseField = await createCustomFieldIfMissing(projectId, fields, 'Phase', [
    'Phase 0',
    'Phase 1',
    'Phase 2',
    'Phase 3',
    'Phase 4',
  ]);

  const moduleField = await createCustomFieldIfMissing(projectId, fields, 'Module', [
    'Auth',
    'Members',
    'Attendance',
    'Giving',
    'WhatsApp',
    'Events',
    'Media',
    'Pastoral',
    'Operations',
    'DevOps',
    'Sync',
    'AI',
  ]);

  const priorityField = await createCustomFieldIfMissing(projectId, fields, 'Priority', [
    'High',
    'Medium',
    'Low',
  ]);

  const fieldMap = {
    Repository: repositoryField,
    Phase: phaseField,
    Module: moduleField,
    Priority: priorityField,
  };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const target = repos[row.Repo];
    if (!target) {
      console.warn(`Unknown repo: ${row.Repo}. Skipping.`);
      skipped++;
      continue;
    }

    const title = `[${row.Module}] ${row.Title}`;
    const body = [
      `**Phase:** ${row.Phase}`,
      `**Module:** ${row.Module}`,
      `**Priority:** ${row.Priority}`,
      `**Repository:** ${row.Repo}`,
      '',
      row.Description,
    ].join('\n');

    const labels = row.Labels
      ? row.Labels.split(',')
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    try {
      const existingIssue = await findExistingIssue(target.owner, target.repo, row.Title);

      let issue;
      if (existingIssue) {
        console.log(`Updating existing issue #${existingIssue.number}: ${title}`);
        const { data: updatedIssue } = await octokit.rest.issues.update({
          owner: target.owner,
          repo: target.repo,
          issue_number: existingIssue.number,
          body,
          labels,
        });
        issue = updatedIssue;
        updated++;
      } else {
        console.log(`Creating issue: ${title}`);
        const { data: newIssue } = await octokit.rest.issues.create({
          owner: target.owner,
          repo: target.repo,
          title,
          body,
          labels,
        });
        issue = newIssue;
        created++;
      }

      // Add issue to project
      console.log(`Adding issue #${issue.number} to project...`);
      const itemId = await addIssueToProject(projectId, issue.node_id);

      // Update custom fields
      const fieldUpdates = [
        { field: fieldMap.Repository, value: row.Repo },
        { field: fieldMap.Phase, value: row.Phase },
        { field: fieldMap.Module, value: row.Module },
        { field: fieldMap.Priority, value: row.Priority },
      ];

      for (const { field, value } of fieldUpdates) {
        const option = field.options.find((opt) => opt.name === value);
        if (option) {
          await updateProjectField(projectId, itemId, field.id, option.id);
        } else {
          console.warn(`Option "${value}" not found for field. Skipping.`);
        }
      }
    } catch (error) {
      console.error(`Failed to process "${title}":`, error.message);
      failed++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total processed: ${rows.length}`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('Workflow failed:', error);
  process.exit(1);
});
