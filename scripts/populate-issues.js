const fs = require("fs");
const { parse } = require("csv-parse/sync");
const { Octokit } = require("@octokit/rest");
const { graphql } = require("@octokit/graphql");

const ORG_NAME = process.env.ORG_NAME || "pappycoder";
const PROJECT_NUMBER = parseInt(process.env.PROJECT_NUMBER || "2", 10);
const CSV_PATH = process.env.CSV_PATH || "churchos_github_projects_import.csv";

if (!process.env.GH_PAT) {
  console.error("Error: GH_PAT environment variable is required.");
  process.exit(1);
}

const octokit = new Octokit({ auth: process.env.GH_PAT });

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `Bearer ${process.env.GH_PAT}`,
  },
});

const repos = {
  "ChurchOS-Backend": { owner: ORG_NAME, repo: "ChurchOS-Backend" },
  "ChurchOS-Web": { owner: ORG_NAME, repo: "ChurchOS-Web" },
  "ChurchOS-Mobile": { owner: ORG_NAME, repo: "ChurchOS-Mobile" },
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

  const result = await graphqlWithAuth(query, {
    org: ORG_NAME,
    number: PROJECT_NUMBER,
  });
  const project = result.organization.projectV2;

  if (!project) {
    throw new Error(
      `Project #${PROJECT_NUMBER} not found in organization ${ORG_NAME}`,
    );
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
 * Create a single-select custom field if it doesn't exist.
 */
async function createCustomFieldIfMissing(
  projectId,
  fields,
  fieldName,
  options,
) {
  if (fields[fieldName]) {
    console.log(`Field "${fieldName}" already exists. Reusing.`);
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
    color: "GRAY",
    description: "",
  }));

  try {
    const result = await graphqlWithAuth(mutation, {
      projectId,
      name: fieldName,
      options: optionInputs,
    });

    return {
      id: result.createProjectV2Field.projectV2Field.id,
      options: result.createProjectV2Field.projectV2Field.options,
    };
  } catch (error) {
    const message = error.errors?.[0]?.message || error.message || "";
    if (message.toLowerCase().includes("already been taken")) {
      console.warn(
        `Field "${fieldName}" is already taken. Fetching existing field...`,
      );
      const { fields: refreshedFields } = await getProjectMetadata();
      if (refreshedFields[fieldName]) {
        return refreshedFields[fieldName];
      }
    }
    throw error;
  }
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

// In-memory cache for loaded issues to prevent repeated API paginations
const issueCache = {};

/**
 * Find existing issue with paginated search coverage
 */
async function findExistingIssue(owner, repo, title) {
  const cacheKey = `${owner}/${repo}`;
  try {
    if (!issueCache[cacheKey]) {
      console.log(`Fetching all issues from ${repo} to build cache...`);
      let allIssues = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const { data: issues } = await octokit.rest.issues.listForRepo({
          owner,
          repo,
          state: "all",
          per_page: 100,
          page,
        });

        allIssues = allIssues.concat(issues);
        if (issues.length < 100) {
          hasMore = false;
        } else {
          page++;
        }
      }
      issueCache[cacheKey] = allIssues;
    }

    return issueCache[cacheKey].find((issue) => issue.title.includes(title));
  } catch (error) {
    console.error(`Error listing issues in ${repo}:`, error.message);
    return null;
  }
}

/**
 * Main execution
 */
async function run() {
  console.log("Loading CSV...");
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found: ${CSV_PATH}`);
  }

  const csv = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true });
  console.log(`Loaded ${rows.length} rows from CSV.`);

  console.log("Fetching project metadata...");
  const { projectId, fields } = await getProjectMetadata();
  console.log(`Found project ID: ${projectId}`);

  console.log("Ensuring custom fields exist...");
  const targetRepoField = await createCustomFieldIfMissing(
    projectId,
    fields,
    "Target Repo",
    ["ChurchOS-Backend", "ChurchOS-Web", "ChurchOS-Mobile"],
  );

  const phaseField = await createCustomFieldIfMissing(
    projectId,
    fields,
    "Phase",
    ["Phase 0", "Phase 1", "Phase 2", "Phase 3", "Phase 4"],
  );

  // Combined module values representing EVERY module used in your CSV rows
  const moduleField = await createCustomFieldIfMissing(
    projectId,
    fields,
    "Module",
    [
      "Prisma",
      "Project Setup",
      "API",
      "Common",
      "Auth",
      "DevOps",
      "Members",
      "Attendance",
      "Giving",
      "WhatsApp",
      "Events",
      "Media",
      "Admin",
      "Pastoral",
      "Operations",
      "Sync",
      "Design",
      "State",
      "Layout",
      "Dashboard",
      "Settings",
      "Finance",
      "Database",
      "Home",
      "Sermons",
      "Prayer",
      "Notifications",
      "Quality",
      "Distribution",
    ],
  );

  const priorityField = await createCustomFieldIfMissing(
    projectId,
    fields,
    "Priority",
    ["High", "Medium", "Low"],
  );

  // Fetch standard 'Status' field from GitHub's default layout
  const statusField = fields["Status"] || null;
  if (!statusField) {
    console.warn("Could not retrieve default 'Status' field options.");
  }

  const fieldMap = {
    "Target Repo": targetRepoField,
    Phase: phaseField,
    Module: moduleField,
    Priority: priorityField,
    Status: statusField,
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
      "",
      row.Description,
    ].join("\n");

    const labels = row.Labels
      ? row.Labels.split(",")
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    try {
      const existingIssue = await findExistingIssue(
        target.owner,
        target.repo,
        row.Title,
      );

      let issue;
      if (existingIssue) {
        console.log(
          `Updating existing issue #${existingIssue.number}: ${title}`,
        );
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

      // Map values and include 'Status' tracking
      const fieldUpdates = [
        { field: fieldMap["Target Repo"], value: row.Repo },
        { field: fieldMap.Phase, value: row.Phase },
        { field: fieldMap.Module, value: row.Module },
        { field: fieldMap.Priority, value: row.Priority },
      ];

      if (fieldMap.Status) {
        fieldUpdates.push({ field: fieldMap.Status, value: row.Status });
      }

      for (const { field, value } of fieldUpdates) {
        if (!field) continue;

        // Match case-sensitively or fallback case-insensitively
        let option = field.options.find((opt) => opt.name === value);
        if (!option && value) {
          option = field.options.find(
            (opt) => opt.name.toLowerCase() === value.toLowerCase(),
          );
        }

        if (option) {
          await updateProjectField(projectId, itemId, field.id, option.id);
        } else {
          console.warn(
            `Option "${value}" not found for field "${field.id}". Skipping.`,
          );
        }
      }

      // Delay to avoid hitting rate limits
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`Failed to process "${title}":`, error.message);
      failed++;
    }
  }

  console.log("\n=== Summary ===");
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
  console.error("Workflow failed:", error);
  process.exit(1);
});
