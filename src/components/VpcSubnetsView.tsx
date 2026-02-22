import { Waypoints, Server, Network, ChevronRight, Globe, Database, Scale } from 'lucide-react';
import type { Resource } from '../types';

interface VpcSubnetsViewProps {
  vpc: Resource;
  allResources: Resource[];
}

export function VpcSubnetsView({ vpc, allResources }: VpcSubnetsViewProps) {
  const subnets: any[] = vpc.specs?.subnets || [];
  const vpcIdNum = Number(vpc.resource_id);

  const linodeResources = allResources.filter(r => r.resource_type === 'linode');
  const dbResources = allResources.filter(r => r.resource_type === 'database');
  const nbResources = allResources.filter(r => r.resource_type === 'nodebalancer');

  function getLinodeResource(linodeId: number): Resource | undefined {
    return linodeResources.find(r => r.resource_id === String(linodeId));
  }

  function getDbsForSubnet(subnetId: number): Resource[] {
    return dbResources.filter(r => r.specs?.subnet_id === subnetId);
  }

  function getNbsForSubnet(subnetId: number): Resource[] {
    return nbResources.filter(r =>
      (r.specs?.vpcs || []).some((v: any) => v.vpc_id === vpcIdNum && v.subnet_id === subnetId)
    );
  }

  function getNbsForVpcOnly(): Resource[] {
    return nbResources.filter(r => {
      const vpcs: any[] = r.specs?.vpcs || [];
      return vpcs.some((v: any) => v.vpc_id === vpcIdNum);
    });
  }

  function getDbsForVpcOnly(): Resource[] {
    return dbResources.filter(r => r.specs?.vpc_id === vpcIdNum);
  }

  function getStatusColor(status?: string) {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'active': return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300';
      case 'stopped': return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300';
      case 'offline': return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
      case 'provisioning':
      case 'restoring': return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300';
      default: return 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300';
    }
  }

  const totalDbs = getDbsForVpcOnly().length;
  const totalNbs = getNbsForVpcOnly().length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-teal-100 dark:bg-teal-900/40 rounded-lg">
          <Waypoints size={20} className="text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{vpc.label}</h1>
          <div className="flex items-center gap-2 mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            <Globe size={13} />
            <span>{vpc.region}</span>
            {vpc.specs?.description && (
              <>
                <span>·</span>
                <span>{vpc.specs.description}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Subnets</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 mt-1">{subnets.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Linodes</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 mt-1">{vpc.specs?.linode_count ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Databases</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 mt-1">{totalDbs}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">NodeBalancers</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 mt-1">{totalNbs}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Monthly Cost</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">Free</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Network size={16} className="text-gray-500 dark:text-gray-400" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Subnets</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{subnets.length}</span>
          </div>
        </div>

        {subnets.length === 0 ? (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500">
            <Network size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No subnets found in this VPC</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {subnets.map((subnet: any) => {
              const attachedLinodes: Resource[] = (subnet.linode_ids || [])
                .map((id: number) => getLinodeResource(id))
                .filter(Boolean) as Resource[];

              const attachedDbs = getDbsForSubnet(subnet.id);
              const attachedNbs = getNbsForSubnet(subnet.id);
              const totalAttached = attachedLinodes.length + attachedDbs.length + attachedNbs.length;

              return (
                <div key={subnet.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-0.5 p-1.5 bg-teal-50 dark:bg-teal-900/30 rounded-md flex-shrink-0">
                        <Network size={14} className="text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100">{subnet.label}</h3>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                            {subnet.ipv4}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">ID: {subnet.id}</span>
                        </div>

                        {attachedLinodes.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                              <Server size={10} />
                              Linodes
                            </p>
                            <div className="space-y-1">
                              {attachedLinodes.map((linode) => (
                                <div
                                  key={linode.id}
                                  className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                >
                                  <Server size={13} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{linode.label}</span>
                                  {linode.region && (
                                    <>
                                      <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                                      <span className="text-xs text-gray-500 dark:text-gray-400">{linode.region}</span>
                                    </>
                                  )}
                                  {linode.plan_type && (
                                    <>
                                      <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                                      <span className="text-xs text-gray-500 dark:text-gray-400">{linode.plan_type}</span>
                                    </>
                                  )}
                                  <span className={`ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(linode.status)}`}>
                                    {linode.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!attachedLinodes.length && subnet.linode_count > 0 && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <Server size={11} className="text-gray-400 dark:text-gray-500" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">{subnet.linode_count} Linode{subnet.linode_count !== 1 ? 's' : ''} attached (not in sync)</span>
                          </div>
                        )}

                        {attachedDbs.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                              <Database size={10} />
                              Databases
                            </p>
                            <div className="space-y-1">
                              {attachedDbs.map((db) => (
                                <div
                                  key={db.id}
                                  className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                >
                                  <Database size={13} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{db.label}</span>
                                  {db.specs?.engine && (
                                    <>
                                      <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                                      <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{db.specs.engine} {db.specs.version}</span>
                                    </>
                                  )}
                                  {db.specs?.public_access === false && (
                                    <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                                      private
                                    </span>
                                  )}
                                  {db.specs?.public_access === true && (
                                    <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                                      public access
                                    </span>
                                  )}
                                  <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(db.status)}`}>
                                    {db.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {attachedNbs.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                              <Scale size={10} />
                              NodeBalancers
                            </p>
                            <div className="space-y-1">
                              {attachedNbs.map((nb) => {
                                const nbVpcEntry = (nb.specs?.vpcs || []).find(
                                  (v: any) => v.vpc_id === vpcIdNum && v.subnet_id === subnet.id
                                );
                                const nbNodeList: any[] = nb.specs?.nodes || [];
                                return (
                                  <div
                                    key={nb.id}
                                    className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
                                  >
                                    <div className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 dark:bg-gray-700/50">
                                      <Scale size={13} className="text-cyan-500 dark:text-cyan-400 flex-shrink-0" />
                                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{nb.label}</span>
                                      {nbVpcEntry?.ipv4_range && (
                                        <>
                                          <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                                          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{nbVpcEntry.ipv4_range}</span>
                                        </>
                                      )}
                                      <span className={`ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(nb.status)}`}>
                                        {nb.status}
                                      </span>
                                    </div>
                                    {nbNodeList.length > 0 && (
                                      <div className="border-t border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
                                        {nbNodeList.map((node: any) => {
                                          const linkedLinode = node.linode_id
                                            ? linodeResources.find(r => r.resource_id === String(node.linode_id))
                                            : undefined;
                                          return (
                                            <div key={node.id} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800/60">
                                              <Server size={11} className="text-blue-400 dark:text-blue-500 flex-shrink-0" />
                                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                                                {linkedLinode ? linkedLinode.label : node.label}
                                              </span>
                                              <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{node.address}</span>
                                              <span className={`ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(node.status)}`}>
                                                {node.status}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {totalAttached === 0 && subnet.linode_count === 0 && (
                          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">No resources attached</p>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                        {totalAttached} resource{totalAttached !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
