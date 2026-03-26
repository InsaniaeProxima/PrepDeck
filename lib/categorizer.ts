export const UNIVERSAL_DOMAINS = [
  { id: "iam_security",   label: "IAM & Security" },
  { id: "networking",     label: "Networking" },
  { id: "compute",        label: "Compute" },
  { id: "storage",        label: "Storage" },
  { id: "databases",      label: "Databases" },
  { id: "containers_k8s", label: "Containers & Kubernetes" },
  { id: "serverless",     label: "Serverless & Event-Driven" },
  { id: "monitoring",     label: "Monitoring & Observability" },
  { id: "architecture",   label: "Architecture & Design" },
  { id: "devops_cicd",    label: "DevOps & CI/CD" },
  { id: "cost_billing",   label: "Cost & Billing" },
  { id: "governance",     label: "Compliance & Governance" },
] as const;

const KEYWORDS: Record<string, string[]> = {
  iam_security: [
    "iam", "rbac", "role-based", "access control", "authentication",
    "authorization", "mfa", "multi-factor", "identity", "credential",
    "policy", "permission", "security group", "encryption", "kms",
    "key management", "tls", "ssl", "certificate", "firewall", "waf",
    "shield", "guardduty", "sentinel", "defender", "zero trust", "pki",
    "secret", "vault", "acl", "oauth", "saml", "sso", "single sign-on",
    "conditional access", "pim", "privileged", "scp", "service control",
  ],
  networking: [
    "vpc", "vnet", "subnet", "cidr", "route table", "routing",
    "load balancer", "elb", "alb", "nlb", "dns", "route 53",
    "cloud dns", "nat gateway", "vpn", "direct connect", "expressroute",
    "peering", "transit gateway", "bgp", "ospf", "eigrp", "vlan",
    "trunking", "network interface", "ip address", "ipv4", "ipv6",
    "bandwidth", "latency", "cdn", "cloudfront", "traffic manager",
    "network policy", "nsg", "stp", "etherchannel",
  ],
  compute: [
    "ec2", "virtual machine", "instance", "ami", "compute engine",
    " vm ", "auto scaling", "scale set", "placement group",
    "dedicated host", "spot instance", "reserved instance", "on-demand",
    "processor", "cpu", "gpu", "hypervisor", "bare metal",
  ],
  storage: [
    "s3", "blob storage", "cloud storage", "object storage", "ebs",
    "disk", "volume", "efs", "file share", "nfs", "glacier", "archive",
    "storage class", "lifecycle", "replication", "backup", "snapshot",
    "storage account", "bucket", "data transfer",
  ],
  databases: [
    "rds", "aurora", "dynamodb", "cosmos db", "cloud sql", "database",
    "sql", "nosql", "redis", "elasticache", "memcached", "bigtable",
    "spanner", "redshift", "bigquery", "data warehouse", "replication",
    "read replica", "failover", "migration", "dms", "cassandra",
    "mongodb", "table", "index", "query", "partition key",
  ],
  containers_k8s: [
    "container", "docker", "kubernetes", "k8s", "ecs", "eks", "gke",
    "aks", "pod", "deployment", "statefulset", "daemonset", "replicaset",
    "service mesh", "ingress", "helm", "kubectl", "kubeadm", "etcd",
    "cri", "cni", "container registry", "ecr", "acr", "gcr", "fargate",
    "cloud run", "openshift", "namespace",
  ],
  serverless: [
    "lambda", "function", "serverless", "api gateway", "step functions",
    "event bridge", "cloud functions", "logic apps", "trigger",
    "event-driven", "pub/sub", "sqs", "sns", "message queue", "event hub",
    "service bus", "kinesis", "dataflow", "notification",
  ],
  monitoring: [
    "cloudwatch", "monitor", "logging", "metrics", "alarm", "dashboard",
    "trace", "x-ray", "log analytics", "observability", "syslog", "snmp",
    "health check", "uptime", "alert", "incident", "apm", "telemetry",
    "prometheus", "grafana", "cloud logging", "cloud monitoring",
  ],
  architecture: [
    "architecture", "design", "well-architected", "high availability",
    "disaster recovery", "fault tolerance", "resilience", "redundancy",
    "multi-region", "active-active", "active-passive", "failover",
    "rpo", "rto", "scalability", "decoupling", "microservice", "monolith",
    "tier", "pattern",
  ],
  devops_cicd: [
    "cicd", "ci/cd", "pipeline", "codepipeline", "codebuild", "codedeploy",
    "jenkins", "git", "terraform", "cloudformation", "deployment manager",
    "infrastructure as code", "iac", "ansible", "automation", "blue-green",
    "canary", "rolling update", "devops", "release", "artifact",
    "build", "deploy",
  ],
  cost_billing: [
    "cost", "pricing", "billing", "budget", "savings plan", "reserved",
    "spot", "free tier", "pricing calculator", "cost explorer",
    "cost management", "optimization", "expense", "pay-as-you-go",
    "on-demand pricing", "right-sizing", "total cost",
  ],
  governance: [
    "compliance", "governance", "audit", "regulation", "gdpr", "hipaa",
    "soc", "iso 27001", "pci", "nist", "framework", "control tower",
    "landing zone", "management group", "azure policy", "config",
    "trusted advisor", "benchmark", "standard", "data residency",
    "sovereignty",
  ],
};

export function categorizeQuestion(
  body: string | undefined,
  answerDescription: string,
  options: string[] | undefined
): string {
  const text = [body, answerDescription, ...(options ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let bestDomain = "general";
  let bestScore = 0;

  for (const { id } of UNIVERSAL_DOMAINS) {
    const keywords = KEYWORDS[id] ?? [];
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = id;
    }
  }

  return bestDomain;
}
