import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const templateVars: Record<string, string[]> = {
  ejari_requirements: ["case_number", "requirements", "upload_link"],
  ejari_docs_received: ["case_number", "client_name"],
  ejari_under_review: ["case_number"],
  ejari_completion: ["client_name", "case_number", "ejari_number", "certificate_link"],
  ejari_rejection: ["client_name", "case_number", "reason"],
  ejari_appointment_proposed: ["client_name", "appointment_date"],
};

for (const [name, vars] of Object.entries(templateVars)) {
  await p.waTemplate.update({
    where: { name },
    data: { variables: JSON.stringify(vars) },
  });
  console.log(`Updated ${name} variables: ${JSON.stringify(vars)}`);
}

await p.$disconnect();
