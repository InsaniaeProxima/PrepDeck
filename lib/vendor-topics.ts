export type VendorTopic = {
  vendorId: string;       // "microsoft", "aws", etc.
  vendorName: string;     // "Microsoft", "Amazon Web Services"
  certFamily: string;     // "Azure Administrator", "AWS Solutions Architect"
  examCodes: string[];    // ["AZ-104"]
  domains: string[];      // ["Identity & Access", "Storage", "Compute", ...]
  concepts: string[];     // searchable technology/concept tags
  level: "associate" | "professional" | "expert" | "foundational" | "specialty";
};

export const VENDOR_TOPICS: VendorTopic[] = [
  // ── Microsoft Azure ──────────────────────────────────────────────────────────
  {
    vendorId: "microsoft",
    vendorName: "Microsoft",
    certFamily: "Azure Administrator",
    examCodes: ["AZ-104"],
    domains: ["Identity & Access", "Storage", "Compute", "Networking", "Monitoring"],
    concepts: ["Azure AD", "RBAC", "Virtual Machines", "Azure Storage", "Blob Storage", "Azure Networking", "VNet", "NSG", "Azure Monitor", "Log Analytics", "Azure Backup", "Site Recovery", "App Service", "Azure Kubernetes Service", "Container Registry", "Azure DNS", "Load Balancer", "Azure Firewall", "Key Vault"],
    level: "associate",
  },
  {
    vendorId: "microsoft",
    vendorName: "Microsoft",
    certFamily: "Azure Fundamentals",
    examCodes: ["AZ-900"],
    domains: ["Cloud Concepts", "Core Azure Services", "Security", "Pricing & Support"],
    concepts: ["Azure Portal", "Resource Manager", "Azure AD", "Compliance", "SLA", "Pricing Calculator", "Subscriptions", "Management Groups", "Azure Policy", "Defender for Cloud"],
    level: "foundational",
  },
  {
    vendorId: "microsoft",
    vendorName: "Microsoft",
    certFamily: "Azure Solutions Architect",
    examCodes: ["AZ-305"],
    domains: ["Identity & Governance", "Data Storage", "Infrastructure", "Business Continuity"],
    concepts: ["Azure AD B2C", "Managed Identity", "Azure Arc", "Blueprints", "Cost Management", "Availability Zones", "Traffic Manager", "Application Gateway", "Service Bus", "Event Hub", "Logic Apps", "API Management", "Cosmos DB", "SQL Managed Instance"],
    level: "expert",
  },
  {
    vendorId: "microsoft",
    vendorName: "Microsoft",
    certFamily: "Azure Security Engineer",
    examCodes: ["AZ-500"],
    domains: ["Identity & Access", "Platform Protection", "Security Operations", "Data & Apps"],
    concepts: ["Azure AD Conditional Access", "MFA", "PIM", "Defender for Cloud", "Microsoft Sentinel", "Key Vault", "Disk Encryption", "Azure Policy", "NSG", "Azure Firewall", "DDoS Protection", "RBAC", "Just-in-Time Access"],
    level: "associate",
  },
  {
    vendorId: "microsoft",
    vendorName: "Microsoft",
    certFamily: "Microsoft 365 Fundamentals",
    examCodes: ["MS-900"],
    domains: ["Cloud Concepts", "M365 Services", "Security & Compliance", "Pricing"],
    concepts: ["Microsoft 365", "Teams", "SharePoint", "OneDrive", "Exchange Online", "Intune", "Azure AD", "Compliance Center", "eDiscovery", "Licensing", "Power Platform"],
    level: "foundational",
  },
  {
    vendorId: "microsoft",
    vendorName: "Microsoft",
    certFamily: "Modern Desktop Administrator",
    examCodes: ["MD-102"],
    domains: ["Deploy & Upgrade", "Manage Policies", "Manage & Protect Devices", "Apps & Data"],
    concepts: ["Intune", "Autopilot", "Configuration Manager", "Co-management", "Compliance Policies", "Conditional Access", "BitLocker", "Windows Hello", "App Protection", "MECM"],
    level: "associate",
  },

  // ── Amazon Web Services ──────────────────────────────────────────────────────
  {
    vendorId: "aws",
    vendorName: "Amazon Web Services",
    certFamily: "AWS Solutions Architect",
    examCodes: ["SAA-C03"],
    domains: ["Secure Architectures", "Resilient Architectures", "High-Performing Architectures", "Cost-Optimized Architectures"],
    concepts: ["EC2", "S3", "VPC", "IAM", "RDS", "Lambda", "CloudFront", "ELB", "Auto Scaling", "Route 53", "ECS", "EKS", "SQS", "SNS", "DynamoDB", "CloudWatch", "CloudTrail", "KMS", "ElastiCache", "Glacier", "EBS", "EFS", "Kinesis", "Redshift", "Athena"],
    level: "associate",
  },
  {
    vendorId: "aws",
    vendorName: "Amazon Web Services",
    certFamily: "AWS Developer",
    examCodes: ["DVA-C02"],
    domains: ["Development", "Security", "Deployment", "Troubleshooting & Optimization"],
    concepts: ["Lambda", "API Gateway", "DynamoDB", "CodePipeline", "CodeDeploy", "CodeBuild", "X-Ray", "SQS", "SNS", "Step Functions", "Cognito", "Elastic Beanstalk", "SAM", "CloudFormation", "S3", "IAM", "STS", "KMS", "CloudWatch"],
    level: "associate",
  },
  {
    vendorId: "aws",
    vendorName: "Amazon Web Services",
    certFamily: "AWS SysOps Administrator",
    examCodes: ["SOA-C02"],
    domains: ["Monitoring & Reporting", "Reliability & Continuity", "Deployment & Provisioning", "Security & Compliance"],
    concepts: ["CloudWatch", "CloudTrail", "Systems Manager", "Config", "Trusted Advisor", "Auto Scaling", "ELB", "EC2", "S3", "RDS", "IAM", "KMS", "VPC", "Route 53", "ElasticBeanstalk", "OpsWorks", "CloudFormation"],
    level: "associate",
  },
  {
    vendorId: "aws",
    vendorName: "Amazon Web Services",
    certFamily: "AWS Solutions Architect Professional",
    examCodes: ["SAP-C02"],
    domains: ["Organizational Complexity", "New Solutions", "Migration Planning", "Cost Optimization"],
    concepts: ["Organizations", "Control Tower", "Landing Zone", "Service Catalog", "Direct Connect", "Transit Gateway", "VPC", "RAM", "SCP", "WAF", "Shield", "GuardDuty", "Macie", "Security Hub", "Cost Explorer", "Savings Plans"],
    level: "professional",
  },
  {
    vendorId: "aws",
    vendorName: "Amazon Web Services",
    certFamily: "AWS Advanced Networking",
    examCodes: ["ANS-C01"],
    domains: ["Network Design", "Network Implementation", "Network Management", "Automation"],
    concepts: ["VPC", "Direct Connect", "Transit Gateway", "Route 53", "CloudFront", "Global Accelerator", "VPN", "BGP", "Network Firewall", "PrivateLink", "VPC Peering", "NAT Gateway", "ELB", "WAF"],
    level: "specialty",
  },

  // ── Cisco ────────────────────────────────────────────────────────────────────
  {
    vendorId: "cisco",
    vendorName: "Cisco",
    certFamily: "CCNA",
    examCodes: ["200-301"],
    domains: ["Network Fundamentals", "Network Access", "IP Connectivity", "IP Services", "Security Fundamentals", "Automation"],
    concepts: ["OSPF", "EIGRP", "BGP", "STP", "VLANs", "Trunking", "EtherChannel", "NAT", "DHCP", "DNS", "ACL", "HSRP", "IPv6", "SNMP", "Syslog", "SSH", "Telnet", "CDP", "LLDP", "AAA"],
    level: "associate",
  },
  {
    vendorId: "cisco",
    vendorName: "Cisco",
    certFamily: "CCNP Enterprise",
    examCodes: ["350-401"],
    domains: ["Architecture", "Virtualization", "Infrastructure", "Network Assurance", "Security", "Automation"],
    concepts: ["SD-WAN", "SD-Access", "LISP", "VXLAN", "QoS", "Multicast", "MPLS", "GRE", "IPsec", "NETCONF", "RESTCONF", "Python", "Ansible", "802.1X", "TrustSec", "DNA Center"],
    level: "professional",
  },
  {
    vendorId: "cisco",
    vendorName: "Cisco",
    certFamily: "CyberOps Associate",
    examCodes: ["200-201"],
    domains: ["Security Concepts", "Security Monitoring", "Host-Based Analysis", "Network Intrusion Analysis", "Security Policies"],
    concepts: ["SIEM", "IDS", "IPS", "NetFlow", "Wireshark", "PCAP", "Threat Intelligence", "Indicators of Compromise", "TTPs", "MITRE ATT&CK", "Malware Analysis", "Forensics", "SOC", "Playbooks"],
    level: "associate",
  },

  // ── CompTIA ──────────────────────────────────────────────────────────────────
  {
    vendorId: "comptia",
    vendorName: "CompTIA",
    certFamily: "CompTIA A+ Core 1",
    examCodes: ["220-1101"],
    domains: ["Mobile Devices", "Networking", "Hardware", "Virtualization & Cloud", "Hardware Troubleshooting"],
    concepts: ["CompTIA A+", "RAM", "CPU", "Motherboard", "BIOS", "UEFI", "SSD", "HDD", "NVMe", "PCIe", "USB", "HDMI", "DisplayPort", "WiFi", "Bluetooth", "Virtualization", "Cloud Computing", "Laser Printer", "Inkjet"],
    level: "associate",
  },
  {
    vendorId: "comptia",
    vendorName: "CompTIA",
    certFamily: "CompTIA A+ Core 2",
    examCodes: ["220-1102"],
    domains: ["Operating Systems", "Security", "Software Troubleshooting", "Operational Procedures"],
    concepts: ["Windows 10", "Windows 11", "Linux", "macOS", "Active Directory", "Group Policy", "NTFS", "FAT32", "Registry", "Task Manager", "BitLocker", "Malware Removal", "Remote Desktop", "PowerShell"],
    level: "associate",
  },
  {
    vendorId: "comptia",
    vendorName: "CompTIA",
    certFamily: "CompTIA Network+",
    examCodes: ["N10-008"],
    domains: ["Networking Concepts", "Infrastructure", "Network Operations", "Network Security", "Network Troubleshooting"],
    concepts: ["TCP/IP", "OSI Model", "Subnetting", "CIDR", "VLANs", "STP", "OSPF", "BGP", "DNS", "DHCP", "HTTP", "HTTPS", "FTP", "SSH", "SNMP", "QoS", "WAN", "Fiber", "Copper", "Wireless Standards"],
    level: "associate",
  },
  {
    vendorId: "comptia",
    vendorName: "CompTIA",
    certFamily: "CompTIA Security+",
    examCodes: ["SY0-701"],
    domains: ["General Security Concepts", "Threats & Vulnerabilities", "Security Architecture", "Security Operations", "Governance & Compliance"],
    concepts: ["PKI", "TLS", "Zero Trust", "MFA", "SIEM", "SOAR", "EDR", "XDR", "Penetration Testing", "Vulnerability Scanning", "OWASP", "SQL Injection", "Phishing", "Ransomware", "Incident Response", "NIST", "ISO 27001"],
    level: "associate",
  },
  {
    vendorId: "comptia",
    vendorName: "CompTIA",
    certFamily: "CompTIA CySA+",
    examCodes: ["CS0-003"],
    domains: ["Security Operations", "Vulnerability Management", "Incident Response", "Reporting & Communication"],
    concepts: ["Threat Hunting", "SIEM", "Log Analysis", "Vulnerability Management", "CVE", "CVSS", "Patch Management", "Threat Intelligence", "IOC", "TTPs", "Forensic Analysis", "Chain of Custody", "Nmap", "Nessus"],
    level: "professional",
  },

  // ── HashiCorp ────────────────────────────────────────────────────────────────
  {
    vendorId: "hashicorp",
    vendorName: "HashiCorp",
    certFamily: "Terraform Associate",
    examCodes: ["TA-002-P", "003"],
    domains: ["IaC Concepts", "Terraform Basics", "Terraform Workflow", "Terraform Modules", "State Management"],
    concepts: ["Terraform", "HCL", "Providers", "Resources", "Data Sources", "State", "Remote State", "Workspaces", "Modules", "Variables", "Outputs", "Provisioners", "Import", "Drift", "Plan", "Apply", "Destroy", "Terraform Cloud"],
    level: "associate",
  },
  {
    vendorId: "hashicorp",
    vendorName: "HashiCorp",
    certFamily: "Vault Associate",
    examCodes: ["VA-002"],
    domains: ["Vault Architecture", "Authentication", "Secrets Engines", "Policies & Access Control", "Operations"],
    concepts: ["Vault", "Secrets", "KV Store", "Dynamic Secrets", "PKI", "AWS Secrets Engine", "AppRole", "Kubernetes Auth", "Policies", "Tokens", "Leases", "Seal/Unseal", "Raft", "High Availability"],
    level: "associate",
  },

  // ── Linux Foundation ─────────────────────────────────────────────────────────
  {
    vendorId: "linux-foundation",
    vendorName: "Linux Foundation",
    certFamily: "Certified Kubernetes Administrator",
    examCodes: ["CKA"],
    domains: ["Cluster Architecture", "Workloads & Scheduling", "Services & Networking", "Storage", "Troubleshooting"],
    concepts: ["Pods", "Deployments", "StatefulSets", "DaemonSets", "Services", "Ingress", "ConfigMaps", "Secrets", "PersistentVolumes", "RBAC", "NetworkPolicy", "etcd", "kubeadm", "kubectl", "Taints", "Tolerations", "Node Affinity", "ResourceQuota"],
    level: "professional",
  },
  {
    vendorId: "linux-foundation",
    vendorName: "Linux Foundation",
    certFamily: "Certified Kubernetes Application Developer",
    examCodes: ["CKAD"],
    domains: ["Application Design", "Deployment", "Observability", "Services & Networking", "Environment & Configuration"],
    concepts: ["Pods", "Multi-container Pods", "Init Containers", "Deployments", "Services", "Ingress", "ConfigMaps", "Secrets", "Jobs", "CronJobs", "Probes", "Resource Limits", "HPA", "Helm"],
    level: "associate",
  },
  {
    vendorId: "linux-foundation",
    vendorName: "Linux Foundation",
    certFamily: "Certified Kubernetes Security Specialist",
    examCodes: ["CKS"],
    domains: ["Cluster Setup", "Cluster Hardening", "System Hardening", "Minimizing Microservice Vulnerabilities", "Supply Chain Security", "Monitoring & Runtime Security"],
    concepts: ["Pod Security Standards", "OPA Gatekeeper", "Falco", "AppArmor", "seccomp", "Network Policies", "RBAC", "ImagePolicyWebhook", "Runtime Security", "Trivy", "Supply Chain", "etcd Encryption"],
    level: "specialty",
  },

  // ── Google Cloud ─────────────────────────────────────────────────────────────
  {
    vendorId: "google",
    vendorName: "Google Cloud",
    certFamily: "Associate Cloud Engineer",
    examCodes: ["ACE"],
    domains: ["Cloud Solutions Setup", "Cloud Solution Planning", "Cloud Solution Deployment", "Cloud Solution Monitoring", "Access & Configuration"],
    concepts: ["Compute Engine", "GKE", "Cloud Run", "App Engine", "Cloud Storage", "Cloud SQL", "BigQuery", "Cloud IAM", "VPC", "Cloud Load Balancing", "Cloud DNS", "Cloud Monitoring", "Cloud Logging", "Deployment Manager", "gcloud CLI"],
    level: "associate",
  },
  {
    vendorId: "google",
    vendorName: "Google Cloud",
    certFamily: "Professional Cloud Architect",
    examCodes: ["PCA"],
    domains: ["Cloud Solution Design", "Analyzing & Optimizing", "Managing Implementation", "Ensuring Reliability", "Security & Compliance"],
    concepts: ["Cloud Spanner", "Anthos", "Cloud Armor", "Cloud CDN", "Pub/Sub", "Dataflow", "Looker", "Cloud Endpoints", "Secret Manager", "Binary Authorization", "Organization Policies", "VPC Service Controls"],
    level: "professional",
  },
  {
    vendorId: "google",
    vendorName: "Google Cloud",
    certFamily: "Professional Data Engineer",
    examCodes: ["PCDE"],
    domains: ["Data Ingestion & Processing", "Data Storage", "BigQuery", "Machine Learning", "Reliability & Policy"],
    concepts: ["BigQuery", "Dataflow", "Pub/Sub", "Dataproc", "Cloud Composer", "Vertex AI", "AutoML", "Cloud Storage", "Bigtable", "Spanner", "Looker Studio", "Data Catalog", "Dataplex", "Data Loss Prevention"],
    level: "professional",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find vendor info for a given exam code (case-insensitive, partial match). */
export function findVendorTopic(examCode: string): VendorTopic | undefined {
  const upper = examCode.toUpperCase();
  return VENDOR_TOPICS.find((v) =>
    v.examCodes.some((c) => upper.includes(c.toUpperCase()))
  );
}

/** Get unique vendor names from a list of exam codes. */
export function getUniqueVendors(examCodes: string[]): string[] {
  const vendors = new Set<string>();
  for (const code of examCodes) {
    const v = findVendorTopic(code);
    if (v) vendors.add(v.vendorName);
  }
  return Array.from(vendors);
}

/** Get all concept tags for a given vendor ID. */
export function getVendorConcepts(vendorId: string): string[] {
  const concepts = new Set<string>();
  for (const v of VENDOR_TOPICS) {
    if (v.vendorId === vendorId) {
      v.concepts.forEach((c) => concepts.add(c));
    }
  }
  return Array.from(concepts);
}

/** Get concept tags for a specific exam code. */
export function getExamConcepts(examCode: string): string[] {
  return findVendorTopic(examCode)?.concepts ?? [];
}
