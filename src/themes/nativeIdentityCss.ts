import type { Container, ChildNode, Root } from 'postcss';
import safeParse from 'postcss-safe-parser';
import { DEFAULT_EVENT_STYLE_ROLE_PRIORITY } from '../eventStyleSettings.ts';

const identityRoles: Record<string, string> = {
  'guard-level-1': 'viceroy', 'guard-level-2': 'admiral', 'guard-level-3': 'captain',
  streamer: 'anchor', mod: 'admin',
};

/** 同一条件及权重的身份根规则按低到高排列，不改变作者的选择器。 */
export function resolveNativeIdentityCss(source: string, priority: readonly string[] = DEFAULT_EVENT_STYLE_ROLE_PRIORITY): string {
  const root = safeParse(source) as Root;
  function sort(container: Container) {
    const groups = new Map<string, { role: string; nodes: ChildNode[] }[]>();
    for (const node of [...(container.nodes ?? [])]) {
      if (node.type === 'atrule' && node.nodes) sort(node);
      if (node.type !== 'rule' || node.selectors.length !== 1) continue;
      const match = node.selector.match(/((?:\.[\w-]+)+)(::[\w-]+)?$/);
      if (!match) continue;
      const classes = match[1].slice(1).split('.');
      const identities = classes.filter(name => identityRoles[name]);
      const prefix = node.selector.slice(0, match.index);
      if (identities.length !== 1 || (prefix && !/[\s>+~]$/.test(prefix))) continue;
      const identity = identities[0];
      const key = prefix + classes.filter(name => name !== identity).join('.') + (match[2] ?? '');
      const nodes: ChildNode[] = [node];
      let previous = node.prev();
      while (previous?.type === 'comment') { nodes.unshift(previous); previous = previous.prev(); }
      const group = groups.get(key) ?? [];
      group.push({role:identityRoles[identity],nodes}); groups.set(key,group);
    }
    for (const group of groups.values()) {
      const ordered = [...group].sort((a,b) => priority.indexOf(b.role) - priority.indexOf(a.role));
      const replacements = ordered.map(entry => entry.nodes.map(node => node.clone()));
      group.forEach((entry,index) => {
        const anchor = entry.nodes[0];
        for (const node of replacements[index]) anchor.before(node);
        for (const node of entry.nodes) node.remove();
      });
    }
  }
  sort(root);
  return root.toString();
}
