/**
 * SCORM-like Manifest Generator
 * 
 * Creates minimal SCORM/IMS manifest for LMS compatibility.
 */

import type { CurriculumBundle } from './exportTypes.js';

/**
 * Generate SCORM-like IMS manifest XML
 */
export function generateSCORMManifest(bundle: CurriculumBundle): string {
  const manifestId = `manifest_${bundle.bundleId}`;
  const organizationId = `org_${bundle.bundleId}`;
  
  const moduleItems: string[] = [];
  const resources: string[] = [];
  
  for (let i = 0; i < bundle.modules.length; i++) {
    const module = bundle.modules[i];
    const moduleItemId = `item_module_${i + 1}`;
    
    const itemRefs: string[] = [];
    for (let j = 0; j < module.items.length; j++) {
      const item = module.items[j];
      const itemId = `item_${i + 1}_${j + 1}`;
      
      // Convert entryUrl to local path (remove /v1/ prefix)
      const localPath = item.entryUrl.replace(/^\/v1\//, 'content/');
      
      itemRefs.push(`        <item identifier="${itemId}" identifierref="${itemId}_resource">
          <title>${escapeXml(item.title)}</title>
          <adlcp:masteryscore>80</adlcp:masteryscore>
        </item>`);
      
      resources.push(`      <resource identifier="${itemId}_resource" type="webcontent" adlcp:scormtype="sco" href="${localPath}">
        <file href="${localPath}"/>
      </resource>`);
    }
    
    moduleItems.push(`      <item identifier="${moduleItemId}">
        <title>${escapeXml(module.title)}</title>
${itemRefs.join('\n')}
      </item>`);
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${manifestId}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${organizationId}">
    <organization identifier="${organizationId}">
      <title>${escapeXml(bundle.title)}</title>
      <item identifier="root_item">
        <title>${escapeXml(bundle.title)}</title>
${moduleItems.join('\n')}
      </item>
    </organization>
  </organizations>
  <resources>
${resources.join('\n')}
  </resources>
</manifest>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

