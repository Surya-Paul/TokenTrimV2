import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: string;
}

interface TabViewProps {
  activeTab: string;
  onChange: (tab: string) => void;
  tabs: readonly Tab[] | Tab[];
}

export function TabView({ activeTab, onChange, tabs }: TabViewProps) {
  return (
    <div className="tab-list" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span className="tab-icon">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface TabPanelProps {
  activeTab: string;
  children: React.ReactNode;
}

export function TabPanel({ activeTab, children }: TabPanelProps) {
  return (
    <div role="tabpanel">
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.key === activeTab) {
          return child;
        }
        return null;
      })}
    </div>
  );
}