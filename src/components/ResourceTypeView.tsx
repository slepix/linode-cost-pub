import { ResourcesList } from './ResourcesList';
import { VpcSubnetsView } from './VpcSubnetsView';
import type { Resource } from '../types';
import type { NavSection } from './Sidebar';

interface ResourceTypeViewProps {
  section: Exclude<NavSection, 'dashboard' | 'compliance_results' | 'rule_manager'>;
  accountId: string | null;
  onResourceSelect: (resource: Resource) => void;
  onRecommendationGenerated?: () => void;
  refreshTrigger?: number;
  syncTrigger?: number;
  selectedVpcId?: string | null;
  allResources?: Resource[];
}

const sectionLabels: Record<Exclude<NavSection, 'dashboard' | 'compliance_results' | 'rule_manager'>, string> = {
  linode: 'Virtual Machines',
  volume: 'Block Storage',
  object_storage: 'Object Storage',
  lke_cluster: 'Kubernetes',
  database: 'Databases',
  nodebalancer: 'Load Balancers',
  firewall: 'Firewalls',
  vpc: 'Virtual Private Cloud',
};

export function ResourceTypeView({ section, accountId, onResourceSelect, onRecommendationGenerated, refreshTrigger, syncTrigger, selectedVpcId, allResources = [] }: ResourceTypeViewProps) {
  if (section === 'vpc' && selectedVpcId) {
    const vpc = allResources.find(r => r.resource_type === 'vpc' && r.id === selectedVpcId);
    if (vpc) {
      return <VpcSubnetsView vpc={vpc} allResources={allResources} />;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{sectionLabels[section]}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage and analyze your {sectionLabels[section].toLowerCase()}</p>
      </div>
      <ResourcesList
        accountId={accountId}
        onResourceSelect={onResourceSelect}
        onRecommendationGenerated={onRecommendationGenerated}
        refreshTrigger={refreshTrigger}
        syncTrigger={syncTrigger}
        defaultTab={section}
      />
    </div>
  );
}
