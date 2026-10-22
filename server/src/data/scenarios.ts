import type { Scenario } from '../domain.js';

const plants = ['Auckland Pack', 'Hamilton Process', 'Tauranga Logistics'];

function fill(template: string, index: number): string {
  const plant = plants[index % plants.length];
  const code = ['1000', '2000', '3100'][index % 3];
  const po = ['4500012381', '4500017742', '4500019020'][index % 3];
  const user = ['planner.shift.a', 'buyer.team.2', 'operator.line.4'][index % 3];
  return template
    .replaceAll('{plant}', plant)
    .replaceAll('{code}', code)
    .replaceAll('{po}', po)
    .replaceAll('{user}', user);
}

export function expandScenario(scenario: Scenario, index: number): { title: string; description: string } {
  const title = fill(scenario.titles[index % scenario.titles.length], index);
  const detail = fill(scenario.details[index % scenario.details.length], index + 1);
  return { title, description: detail };
}

export const DISTRACTORS: { title: string; body: string; category: Scenario['category']; system: string }[] = [
  {
    title: 'How to contact the Northline service desk',
    category: 'SOFTWARE',
    system: 'Service Desk',
    body: 'Employees can contact the service desk through the portal, by phone from a plant extension, or by asking a supervisor to log a request. Include the plant, the business system, and what you were trying to do. A user who cannot access a system should still describe the screen, the time, and whether colleagues are affected. The service desk records the request, assigns a team, and keeps the requester informed. This article does not diagnose ERP, MES, network, hardware, or security incidents.',
  },
  {
    title: 'Standard change window for office software',
    category: 'SOFTWARE',
    system: 'Service Desk',
    body: 'Office software changes are scheduled on Thursday evenings. A user who wants a new application must use the catalogue. The service desk will not install unapproved tools during the working day. Access requests, password questions, and general how-to questions are handled in the same queue as other low-urgency work. Please include the computer name if you know it. This article is a policy page, not a troubleshooting guide for a failed business transaction.',
  },
  {
    title: 'Password hygiene reminder',
    category: 'IDENTITY_ACCESS',
    system: 'Azure AD',
    body: 'Northline passwords must be unique and must not be shared. A user who forgets a password can use the self-service portal when MFA still works. Do not send passwords by email. This reminder covers ordinary account hygiene for every employee. It does not unlock a production account, it does not explain a plant outage, and it does not replace the incident guide for a suspected phishing message.',
  },
  {
    title: 'What to include in any IT request',
    category: 'SOFTWARE',
    system: 'Service Desk',
    body: 'A useful request names the plant, the application, the error text, and whether production, shipping, or finance is waiting. Screenshots of error text can be pasted as words. The support team uses this information to route work. Generic notes such as computer not working are returned for more detail. This page is only a writing guide for employees.',
  },
];

export const scenarios: Scenario[] = [
  {
    key: 'erp-po-hang',
    category: 'ERP',
    system: 'SAP S/4HANA',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'SAP ME21N purchase order screen hangs after the GUI patch',
    steps: [
      'Confirm the failure is transaction ME21N or ME22N and record the SAP client and plant.',
      'Check whether SAP GUI patch 7.80 was installed from Software Center this week.',
      'Clear the local cache under %APPDATA%\\SAP\\SAP GUI and reopen the production client.',
      'If the hourglass remains, search ST22 for a TIME_OUT dump on program SAPMM06E.',
      'Escalate to SAP Basis with the dump identifier. Do not restart application servers.',
    ],
    resolution:
      'Cleared the SAP GUI cache after patch 7.80 and reopened ME21N. Purchase order entry worked again. Basis was not asked to restart servers.',
    titles: [
      'Cannot open purchase order {po} in SAP',
      'ME21N spins forever for buyers at {plant}',
      'S/4HANA procurement screen freeze after GUI patch',
      'Buyers cannot raise a purchase order today',
    ],
    details: [
      'The buyer account {user} at {plant} cannot open purchase order {po}. Transaction ME21N shows an hourglass and never reaches the header. It started after the SAP GUI patch. Plant {code} procurement is waiting.',
      'Purchase order creation is stuck in S/4HANA. {plant} reports ME21N hangs before the vendor field. There is no short dump on the user screen. Other SAP menus still open.',
      'Procurement cannot create a PO in the production client. The screen spins on ME21N for plant {code}. Colleagues with the older GUI can still enter a purchase order.',
      'SAP purchase order {po} will not open for editing. ME22N sits on an hourglass at {plant}. The team can display the vendor master, so this is not a network outage.',
    ],
  },
  {
    key: 'erp-gr-fail',
    category: 'ERP',
    system: 'SAP S/4HANA',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'MIGO goods receipt fails for movement type 101',
    steps: [
      'Ask the warehouse clerk for the material document attempt, plant, and storage location.',
      'In MIGO, confirm movement type 101 is posted against the open purchase order item.',
      'Check the material master plant view for {code} and make sure the storage location is extended.',
      'Review the error M7 021 or M7 022 and extend the location with MMSL if it is missing.',
      'Post the goods receipt again. Do not change the purchase order price or the vendor.',
    ],
    resolution:
      'Storage location was not extended for the material at the receiving plant. Extended the plant view and posted movement type 101 in MIGO. Goods receipt completed.',
    titles: [
      'Goods receipt fails in MIGO for plant {code}',
      'Warehouse cannot post movement type 101',
      'Inventory posting rejected for purchase order {po}',
      'Receiving cannot complete a goods receipt',
    ],
    details: [
      'At {plant} the clerk cannot post a goods receipt. MIGO returns an error for movement type 101 on purchase order {po}. The truck is at the dock and inventory has not increased.',
      'Inventory posting is rejected for material received at plant {code}. The message mentions storage location during MIGO. The purchase order itself is released.',
      'Warehouse at {plant} is blocked on a goods receipt. Movement type 101 will not post, so put-away cannot start. This is an S/4HANA receiving issue, not a scanner fault.',
      'The receiving team tried twice to post purchase order {po} in MIGO. Both attempts failed before a material document was created.',
    ],
  },
  {
    key: 'erp-period',
    category: 'ERP',
    system: 'SAP S/4HANA',
    urgency: 'MEDIUM',
    priority: 'P3',
    heldOut: false,
    articleTitle: 'FI posting period is closed for vendor invoices',
    steps: [
      'Note the company code, fiscal period, and the document date the clerk used.',
      'Open OB52 and check whether the vendor posting period is open for that company code.',
      'If the period was closed on schedule, ask the clerk to use a document date in the open period.',
      'If Finance has approved a back-post, request the period to be reopened by the FI control owner.',
      'Do not post the invoice through a different company code to bypass the close.',
    ],
    resolution:
      'The vendor invoice used a document date in a closed FI period. The clerk re-dated it to the open period and posted it. OB52 was left unchanged.',
    titles: [
      'Vendor invoice will not post in SAP',
      'FI period closed for company code at {plant}',
      'Accounts payable document rejected',
      'Cannot park a supplier invoice this morning',
    ],
    details: [
      'Accounts payable at {plant} cannot post a vendor invoice. SAP says the posting period is not open. The purchase order and goods receipt already exist. Company code uses plant {code}.',
      'The FI document for a supplier invoice is rejected. The clerk believes the month was closed in OB52. No one else in procurement is blocked from creating purchase orders.',
      'A non-urgent accounts payable request: invoice parking fails because the fiscal period is closed. The supplier is not on stop. Plant {plant}.',
      'Finance user {user} cannot park an invoice dated last month. The error refers to the FI posting period, not to tax or the vendor master.',
    ],
  },
  {
    key: 'erp-report-slow',
    category: 'ERP',
    system: 'SAP S/4HANA',
    urgency: 'LOW',
    priority: 'P4',
    heldOut: true,
    articleTitle: 'MB52 stock report runs slowly for one plant',
    steps: [
      'Confirm the user is running MB52 for a single plant rather than all plants.',
      'Ask them to add a material type or storage location to reduce the selection.',
      'Check SM50 for a long-running dialog work process owned by that user.',
      'If the report finishes within a few minutes, record it as a performance request, not an incident.',
      'Do not restart the SAP instance for a single slow stock report.',
    ],
    resolution:
      'The planner was running MB52 for every plant. Restricted the selection to plant {code} and the report finished. No instance restart was required.',
    titles: [
      'MB52 stock report is slow',
      'Inventory report takes too long in SAP',
      'Planner waiting on a warehouse stock list',
      'S/4HANA stock display is sluggish today',
    ],
    details: [
      'The planner at {plant} says MB52 takes several minutes. They are not locked out, and purchase orders still open. They would like the stock report to be faster when convenient.',
      'A low-urgency request from {user}: the warehouse stock list in S/4HANA is sluggish for plant {code}. No production order is stopped.',
      'Inventory report MB52 spins for a long time when all storage locations are selected. Other transactions are normal at {plant}.',
      'Please look at a slow SAP stock display when the queue allows. The user can still work. Plant {plant}, selection is very wide.',
    ],
  },
  {
    key: 'mes-line-down',
    category: 'MES',
    system: 'LineSight MES',
    urgency: 'CRITICAL',
    priority: 'P1',
    heldOut: false,
    articleTitle: 'LineSight station offline and the packing line is stopped',
    steps: [
      'Confirm with the supervisor that the packing line is stopped and record the station id.',
      'Check the LineSight collector service on the station. Restart only that station service, not the plant MES cluster.',
      'Verify the station still has a DHCP lease and can reach the MES broker on port 8883.',
      'If the broker is reachable, reload the station configuration and watch for a heartbeat.',
      'Release the line only after the supervisor sees live counts. Do not bypass quality holds.',
    ],
    resolution:
      'The station collector service had stopped after a power blip. Restarted the station service, confirmed the heartbeat, and the supervisor restarted the packing line.',
    titles: [
      'Packing line is down because MES station is offline',
      'LineSight heartbeat lost and production stopped',
      'Station offline at {plant}, line is stopped',
      'Cannot release process orders, line down',
    ],
    details: [
      'Production stopped at {plant}. The LineSight station on the packing line shows offline and there is no heartbeat. Operators cannot release the process order. This is a line-down incident.',
      'MES station is offline after a short power blip. The packing line is down and finished goods are not moving. Plant {code}. Supervisor is on the line now.',
      'LineSight will not accept counts. The screen says station offline. Production stopped at {plant}. This is not a planned break.',
      'Critical: the line is down. Operators at {plant} cannot complete the process order because the MES station lost its heartbeat.',
    ],
  },
  {
    key: 'mes-scan',
    category: 'MES',
    system: 'LineSight MES',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'Barcode scan does not post a packing confirmation',
    steps: [
      'Compare the scanned GTIN with the process order material in LineSight.',
      'Confirm the scan station is in packing mode rather than inventory-count mode.',
      'Watch the MES message log for REJECT_CODE UNIT_MISMATCH.',
      'If the unit of measure on the order is carton and the label is each, reprint the carton label from the order.',
      'Post one test confirmation with the supervisor before releasing the pallet.',
    ],
    resolution:
      'The label barcode was an each-unit GTIN while the process order expected a carton. Reprinted the carton label. The packing confirmation posted in LineSight.',
    titles: [
      'Barcode scan will not post to LineSight',
      'Packing confirmation rejected at {plant}',
      'MES rejects the carton scan',
      'Scan station shows UNIT_MISMATCH',
    ],
    details: [
      'Operators at {plant} scan the finished carton but LineSight does not post the packing confirmation. The message log shows UNIT_MISMATCH. The line is still running slowly on manual counts.',
      'A barcode scan is rejected with UNIT_MISMATCH at the packing station. The process order is open. Plant {code}. Shipping will miss the pickup if this lasts the afternoon.',
      'LineSight packing mode is on, but every scan of the finished goods label fails. The GTIN on the label does not match the order unit. User {user}.',
      'MES will not accept the carton barcode at {plant}. Inventory is not the problem; the packing confirmation never posts.',
    ],
  },
  {
    key: 'mes-recipe',
    category: 'MES',
    system: 'LineSight MES',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'Mixer process order is bound to the wrong recipe',
    steps: [
      'Stop additions on the mixer and record the process order and recipe version on screen.',
      'In LineSight, compare the recipe version with the released specification for that material.',
      'If the order was copied from a trial, rebind it to the released recipe. Do not edit quantities by hand.',
      'Ask Quality to confirm the rebind before any further addition.',
      'Scrap partial additions only if Quality writes a deviation. The service desk does not approve product release.',
    ],
    resolution:
      'The process order still pointed at a trial recipe. Rebound it to the released specification and Quality confirmed the mixer could restart additions.',
    titles: [
      'Mixer has the wrong recipe in MES',
      'Process order bound to a trial recipe',
      'LineSight recipe version is not the released one',
      'Quality stopped the mixer over the recipe',
    ],
    details: [
      'At {plant} Quality stopped the mixer. LineSight shows a trial recipe on the process order instead of the released specification. No further additions should be made.',
      'The process order was copied forward and kept the wrong recipe version. Mixer operators at plant {code} are waiting on a rebind. This is not a mechanical fault.',
      'MES recipe on the batch does not match the released specification. User {user} needs the order rebound before the shift adds the next ingredient.',
      'Wrong recipe in LineSight for the mixer at {plant}. Quality has the batch on hold until the process order is corrected.',
    ],
  },
  {
    key: 'mes-oee',
    category: 'MES',
    system: 'LineSight MES',
    urgency: 'LOW',
    priority: 'P4',
    heldOut: true,
    articleTitle: 'OEE dashboard is blank for a single shift',
    steps: [
      'Confirm live station counts are still posting. If they are, production is not stopped.',
      'Check the dashboard filter for shift, line, and plant. A shift code from another site returns an empty chart.',
      'Refresh the LineSight analytics cache for that line only.',
      'If the chart remains empty, open a low-urgency defect for the analytics job.',
      'Do not restart collectors while counts are posting.',
    ],
    resolution:
      'The OEE dashboard filter was set to the previous site shift code. Corrected the filter and refreshed the analytics cache. Counts had been posting the whole time.',
    titles: [
      'OEE dashboard is blank',
      'LineSight chart shows no shift data',
      'Analytics view empty for {plant}',
      'Supervisor cannot see the OEE chart',
    ],
    details: [
      'The supervisor at {plant} says the OEE dashboard is blank for the morning shift. Stations are still counting, and the line is running. They would like the chart back when someone is free.',
      'LineSight analytics shows an empty chart for plant {code}. This is not a line-down event. Live counts are visible on the station itself.',
      'A low-priority request from {user}: the shift OEE chart has no points. Filters may be wrong. Production is unaffected.',
      'Please check the MES dashboard for {plant}. The OEE view is empty even though the packing line is running normally.',
    ],
  },
  {
    key: 'iam-locked',
    category: 'IDENTITY_ACCESS',
    system: 'Azure AD',
    urgency: 'MEDIUM',
    priority: 'P3',
    heldOut: false,
    articleTitle: 'SAP account locked after repeated password failures',
    steps: [
      'Verify the caller using the employee number and the manager recorded in the directory.',
      'In Azure AD, confirm the lockout is for the SAP provisioning app and not a disabled account.',
      'Unlock the account and require a password reset at the next sign-in.',
      'Remind the user that five bad passwords lock the account for 15 minutes.',
      'Do not disclose the old password and do not create a shared login.',
    ],
    resolution:
      'Verified the employee, unlocked the Azure AD account that feeds SAP, and forced a password reset. The user signed in. No shared account was created.',
    titles: [
      'SAP account locked after bad passwords',
      'User {user} cannot sign in to S/4HANA',
      'Account lockout for a planner at {plant}',
      'Repeated password failures locked ERP login',
    ],
    details: [
      'Employee {user} at {plant} failed the SAP password several times and is now locked. Azure AD shows the lockout. A colleague can still sign in, so the ERP system itself is up. Identity request, not an outage.',
      'Please unlock the account used for S/4HANA. The user knows they typed the wrong password. Plant {code}. They can wait for a verified reset.',
      'Directory lockout is stopping one planner from signing in to SAP. There is no production stop. Caller is at {plant} and has their employee number ready.',
      'ERP login failed until the account locked. This is an identity issue for {user}. Please verify them and reset the password.',
    ],
  },
  {
    key: 'iam-mfa',
    category: 'IDENTITY_ACCESS',
    system: 'Azure AD',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'MFA prompt loops for VPN and email',
    steps: [
      'Confirm the user is approving the Microsoft Authenticator number match, not an old SMS code.',
      'Check Azure AD sign-in logs for error 500121 on the VPN and Exchange applications.',
      'Remove stale authenticator methods and register a new method while the user is on a known plant phone.',
      'Revoke refresh tokens after the new method is registered.',
      'Test VPN and Outlook once. Do not disable MFA for the account.',
    ],
    resolution:
      'Sign-in logs showed error 500121 from a stale authenticator method. Registered a new method, revoked refresh tokens, and MFA completed for VPN and email.',
    titles: [
      'MFA loop on VPN and Outlook',
      'Authenticator number match never finishes',
      'User stuck on the MFA prompt',
      'Cannot pass multi-factor sign-in at {plant}',
    ],
    details: [
      '{user} at {plant} approves the Authenticator prompt and is immediately asked again. VPN and Outlook both loop. Sign-in never completes. The plant network itself is up because other people are online.',
      'Multi-factor authentication will not finish for one supervisor. The prompt returns in a loop. They need email before the supplier call. Plant {code}.',
      'Azure AD keeps repeating the number-match challenge. The user is not locked out by a bad password. VPN access is blocked only for this account.',
      'Please check a looping MFA prompt for {user}. Outlook and VPN both fail after the approval. Do not turn off MFA.',
    ],
  },
  {
    key: 'iam-joiner',
    category: 'IDENTITY_ACCESS',
    system: 'Azure AD',
    urgency: 'LOW',
    priority: 'P4',
    heldOut: false,
    articleTitle: 'New starter needs standard SAP and MES access',
    steps: [
      'Confirm the start date, manager, plant, and role on the joiner form.',
      'Add the user to the standard Azure AD groups for that role. Do not copy a privileged account.',
      'SAP access follows the role group overnight. MES access follows the plant operator group.',
      'Tell the manager which access arrives the next working day.',
      'If the person starts today and cannot train, raise the request as medium rather than inventing access.',
    ],
    resolution:
      'Joined the new starter to the standard planner groups for SAP and LineSight. No emergency access was required. The manager was told to expect provisioning overnight.',
    titles: [
      'New starter access for SAP and MES',
      'Joiner at {plant} needs a standard account',
      'Please provision a planner account',
      'Leaver form is not this, it is a new employee',
    ],
    details: [
      'A new planner starts next Monday at {plant}. Please give the standard SAP display role and LineSight read access. There is no urgency and no production impact. Manager has signed the joiner form.',
      'Identity request for a joiner. User {user} needs ordinary access, not an administrator role. Plant {code}. Start date is next week.',
      'Please create the normal accounts for a new employee in procurement. They do not need anything today. This is a routine joiner.',
      'Standard access request for {plant}. The person is not replacing an urgent absence. SAP and MES only, least privilege.',
    ],
  },
  {
    key: 'iam-wrong-role',
    category: 'IDENTITY_ACCESS',
    system: 'Azure AD',
    urgency: 'MEDIUM',
    priority: 'P3',
    heldOut: true,
    articleTitle: 'User has the wrong SAP plant authorisation',
    steps: [
      'Compare the requested plant with the plant on the manager approval.',
      'Remove the old plant role and add the destination plant role in the identity group.',
      'Ask the user to sign out of SAP so the new authorisation profile loads.',
      'Confirm they can display a document for the new plant and cannot change the old plant.',
      'Do not grant the all-plant role to solve a transfer.',
    ],
    resolution:
      'The planner had transferred to plant 3100 but still held plant 1000 roles. Swapped the identity groups. SAP showed the new plant after a fresh sign-in.',
    titles: [
      'Wrong plant authorisation in SAP',
      'Transferred user cannot open plant {code}',
      'Role still points at the old site',
      'Need the correct plant profile for {user}',
    ],
    details: [
      '{user} moved to {plant} last week but SAP still opens the old plant. They can sign in, so this is not a lockout. Please change the plant authorisation. Work is waiting but the line is not down.',
      'Identity group still grants the previous site. The user needs plant {code} display and change for their new role. Manager approval is attached in the request text.',
      'A transferred buyer cannot see purchase orders for {plant}. Login works. The authorisation profile is for the wrong plant.',
      'Please correct SAP plant roles for {user}. Do not give access to every plant. Medium priority.',
    ],
  },
  {
    key: 'net-wifi-down',
    category: 'NETWORK',
    system: 'Plant network',
    urgency: 'CRITICAL',
    priority: 'P1',
    heldOut: false,
    articleTitle: 'Warehouse wireless is down and scanners are offline',
    steps: [
      'Confirm more than one scanner and one PC have lost the warehouse SSID. A single device is a hardware fault.',
      'Check the wireless controller for the {plant} warehouse zone and the access-point status.',
      'If the zone controller is up but the SSID is disabled, re-enable the warehouse SSID. Do not change firewall rules.',
      'Restart one failed access point only if the controller shows it as disconnected.',
      'Ask the warehouse lead to test two scanners before calling the incident resolved.',
    ],
    resolution:
      'The warehouse SSID had been left disabled after overnight maintenance. Re-enabled it on the zone controller. Scanners came back and shipping resumed. No firewall change was made.',
    titles: [
      'Warehouse wifi is down and scanners are offline',
      'Plant wireless outage at {plant}',
      'Shipping blocked because the SSID is gone',
      'All handhelds dropped off the warehouse network',
    ],
    details: [
      'The warehouse wireless at {plant} is down. Every scanner is offline and shipping is blocked. Office wifi in the admin block still works. This is a network outage, not a single broken handheld.',
      'Critical network issue: the warehouse SSID disappeared at plant {code}. Pick faces cannot confirm pallets. Please check the wireless controller.',
      'All handhelds dropped at once at {plant}. The line can pack, but shipping is blocked until scanners are back on the network.',
      'Warehouse wifi down after overnight work. Multiple access points in that zone look dark. Scanners are offline.',
    ],
  },
  {
    key: 'net-vpn',
    category: 'NETWORK',
    system: 'Plant network',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'Site VPN to plant 3 is flapping',
    steps: [
      'Check the VPN concentrator for the tunnel to plant 3 and note whether the peer is up.',
      'Compare packet loss on the WAN link with the carrier status page.',
      'If the tunnel resets every few minutes, fail traffic to the secondary peer.',
      'Tell the plant which applications will pause during the fail-over.',
      'Do not rebuild the encryption domain during the working shift.',
    ],
    resolution:
      'The primary VPN peer to plant 3 was flapping because of WAN loss. Traffic was moved to the secondary peer. The encryption domain was not rebuilt.',
    titles: [
      'VPN to plant 3 keeps dropping',
      'Site-to-site tunnel is flapping',
      'Hamilton link resets every few minutes',
      'WAN tunnel unstable for {plant}',
    ],
    details: [
      'The site VPN used by {plant} to reach central SAP is flapping. Sessions drop every few minutes. Some users can work between drops. Please check the tunnel and the WAN peer.',
      'Network team: the plant 3 tunnel is unstable. Packet loss is visible. This is not an individual MFA problem because several sites report the same drop.',
      'Site-to-site VPN resets and LineSight clients lose their session. The local warehouse wifi is still up. Plant {code}.',
      'High priority. The WAN tunnel for {plant} is flapping and planners lose SAP in the middle of a transaction.',
    ],
  },
  {
    key: 'net-printer-vlan',
    category: 'NETWORK',
    system: 'Plant network',
    urgency: 'MEDIUM',
    priority: 'P3',
    heldOut: false,
    articleTitle: 'Label printers unreachable after a VLAN change',
    steps: [
      'Confirm the printer IP and that the new VLAN is the one approved on the change ticket.',
      'Check the access port VLAN against the printer MAC address.',
      'Move the port back to the label-printer VLAN if the change put it on the office VLAN.',
      'Print a test label from the packing station.',
      'Do not open a wide firewall rule between the office and the plant floor.',
    ],
    resolution:
      'The label printer port had been moved to the office VLAN. Returned the port to the printer VLAN. A test label printed. No firewall rule was added.',
    titles: [
      'Label printers unreachable after the VLAN change',
      'Packing printer has no network path',
      'Cannot reach the printer IP at {plant}',
      'VLAN change stranded the label devices',
    ],
    details: [
      'After last night’s VLAN change the label printers at {plant} are unreachable. PCs on the office network are fine. Packing can still scan, but labels will not print. Medium priority.',
      'The printer IP does not answer from the packing station. The port may be on the wrong VLAN. Plant {code}. This is a network path issue, not a paper jam.',
      'Label devices dropped off after the change window. User {user} can ping the gateway but not the printer. Please check the access port VLAN.',
      'Network request: printers stranded by a VLAN change at {plant}. Shipping labels are delayed, not fully stopped, because one old printer still works.',
    ],
  },
  {
    key: 'net-guest',
    category: 'NETWORK',
    system: 'Plant network',
    urgency: 'LOW',
    priority: 'P4',
    heldOut: true,
    articleTitle: 'Guest wireless is slow in the office block',
    steps: [
      'Confirm the complaint is the guest SSID and that the corporate SSID is normal.',
      'Check client count on the guest zone. It is rate-limited by design.',
      'Ask the visitor to use the corporate path sponsored by an employee if they need ERP.',
      'Do not raise the guest bandwidth cap without a change request.',
      'Record the request as low priority.',
    ],
    resolution:
      'Guest wireless was within its designed rate limit. The visitor was sponsored onto the corporate SSID for the meeting. The guest cap was not raised.',
    titles: [
      'Guest wifi is slow in the office',
      'Visitor network is barely usable',
      'Please look at the guest SSID when free',
      'Office guest wireless feels throttled',
    ],
    details: [
      'Visitors at {plant} say the guest wifi is slow. Staff on the corporate SSID are fine. Nobody is stopped from production work. A low-priority look is enough.',
      'The guest network in the office block is sluggish during a supplier visit. This is not the warehouse wireless and scanners are online.',
      'User {user} asks for someone to check guest throughput at plant {code} when the queue allows. No incident is in progress.',
      'Office guest SSID feels rate-limited. Please advise. Plant systems are otherwise normal.',
    ],
  },
  {
    key: 'hw-scanner',
    category: 'HARDWARE',
    system: 'Shop-floor hardware',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'A warehouse scanner will not pair and shipping is blocked',
    steps: [
      'Confirm whether one scanner or the whole wireless zone has failed. One device stays in the hardware queue.',
      'Reseat the battery and confirm the scanner shows the warehouse SSID.',
      'If it associates but will not pair with the cradle, forget the cradle and pair it again.',
      'Replace the unit from the {plant} spare pool if pairing still fails.',
      'Do not reconfigure the wireless controller for a single handheld.',
    ],
    resolution:
      'A single scanner had a failed battery and would not stay paired. Swapped it with a spare from the pool. The wireless network was healthy and shipping continued.',
    titles: [
      'Handheld scanner will not pair',
      'One warehouse scanner is dead',
      'Shipping bench blocked by a bad handheld',
      'Scanner battery fault at {plant}',
    ],
    details: [
      'One scanner at the {plant} shipping bench will not pair with its cradle. Other scanners on the same wifi are working, so the network is up. This bench cannot confirm the outbound pallet.',
      'Hardware fault: handheld drops power as soon as it leaves the cradle. User {user} has tried a reboot. Shipping for that bench is blocked. Plant {code}.',
      'The scanner associates to wifi and then loses the cradle pairing. Only this unit is affected. Please swap it if the battery is the cause.',
      'A single warehouse scanner failed at {plant}. It is not a site-wide wireless outage. The bench needs a spare today.',
    ],
  },
  {
    key: 'hw-printer-jam',
    category: 'HARDWARE',
    system: 'Shop-floor hardware',
    urgency: 'LOW',
    priority: 'P4',
    heldOut: false,
    articleTitle: 'Office printer paper jam for a single user',
    steps: [
      'Ask the user which printer name is on the job and whether colleagues can print.',
      'Clear the paper path and close the trays until the jam sensor clears.',
      'Print a configuration page from the device panel.',
      'If the device is healthy, cancel the stuck queue job on the user PC.',
      'A single office jam is low priority. Do not swap a plant label printer into the office.',
    ],
    resolution:
      'Cleared a paper jam in the office printer and cancelled the stuck job. Other staff had been able to print throughout. Low-priority hardware call.',
    titles: [
      'Office printer jam on my floor',
      'Single printer will not feed paper',
      'Please clear a jam when someone is passing',
      'Desktop print job stuck behind a jam',
    ],
    details: [
      'The office printer near reception at {plant} has a paper jam. Colleagues can use the other printer. There is no production impact. Low priority hardware request from {user}.',
      'A single desktop printer will not feed. The queue shows one stuck job. Plant {code}. This can wait behind real incidents.',
      'Paper jam, not a network fault. The printer has an address and answers a ping. Only one person is affected.',
      'Please clear the office printer jam at {plant} when convenient. Labels on the packing line are a different device and they are fine.',
    ],
  },
  {
    key: 'hw-bluescreen',
    category: 'HARDWARE',
    system: 'Shop-floor hardware',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'Shop-floor terminal blue screen on the packing line',
    steps: [
      'Record the stop code if it is still on screen. Photograph it if the operator can do so safely.',
      'Reseat the power lead and boot the terminal once.',
      'If it blue-screens again, move the spare terminal from the {plant} crib onto the station.',
      'Leave the failed unit for a memory test. Do not reimage it on the line.',
      'Confirm LineSight comes back on the spare before the supervisor starts the station.',
    ],
    resolution:
      'The packing terminal blue-screened on each boot. Replaced it with the crib spare and LineSight loaded. The failed unit was tagged for a memory test off the line.',
    titles: [
      'Shop-floor terminal blue screen',
      'Packing PC keeps crashing',
      'Terminal will not stay booted at {plant}',
      'Need the spare PC on the line',
    ],
    details: [
      'The packing terminal at {plant} shows a blue screen each time it boots. Operators cannot open LineSight on that station. A spare should be fitted. Other terminals are fine.',
      'Hardware crash on one shop-floor PC. Stop code appears, then it reboots. Plant {code}. The line is slowed because that station has no screen.',
      'User {user} reports the terminal will not stay up. This is the PC itself, not the MES recipe and not the wireless network.',
      'High priority hardware: blue screen on the packing terminal. Please swap in the spare from the crib.',
    ],
  },
  {
    key: 'hw-dock',
    category: 'HARDWARE',
    system: 'Shop-floor hardware',
    urgency: 'MEDIUM',
    priority: 'P3',
    heldOut: true,
    articleTitle: 'Dock PC has no display and receiving is slowed',
    steps: [
      'Check the display cable and try the known-good monitor from the dock office.',
      'If the PC fans spin but there is no image, swap the terminal with the dock spare.',
      'Receiving can log arrivals on the neighbouring bench while the swap happens.',
      'Tag the failed display adapter for replacement.',
      'Do not declare a network outage if other dock PCs are online.',
    ],
    resolution:
      'The dock PC power supply was good but the display adapter had failed. Swapped the terminal. Receiving moved back to that bench. Neighbouring PCs had stayed online.',
    titles: [
      'Dock PC has no display',
      'Receiving terminal screen is black',
      'No image on the inbound desk PC',
      'Hardware fault on the dock computer',
    ],
    details: [
      'The inbound dock PC at {plant} powers on and the fans spin, but there is no display. The next bench still works, so the network is up. Receiving is slowed rather than stopped.',
      'Black screen on one dock terminal. User {user} already tried another cable. Plant {code}. Medium priority hardware.',
      'No image on the receiving PC. Please swap it if the display adapter is dead. Other systems at the dock are fine.',
      'A single dock computer has no display. This is not a warehouse wifi incident and scanners are still online.',
    ],
  },
  {
    key: 'sw-cad',
    category: 'SOFTWARE',
    system: 'Standard software',
    urgency: 'LOW',
    priority: 'P4',
    heldOut: false,
    articleTitle: 'Request for the approved CAD viewer',
    steps: [
      'Confirm the application is the approved CAD viewer in the software catalogue.',
      'Check the user is in the engineering group that is licensed for it.',
      'Deploy the catalogue package. Do not install a copy from a supplier email.',
      'The package does not require a reboot of any server.',
      'Close the request as a standard software fulfilment.',
    ],
    resolution:
      'Deployed the approved CAD viewer from the catalogue to the engineering laptop. No local installer from email was used. Low-priority software request.',
    titles: [
      'Please install the approved CAD viewer',
      'Engineering laptop needs the catalogue viewer',
      'Software request for drawings viewer',
      'Need the standard CAD package',
    ],
    details: [
      'An engineer at {plant} needs the approved CAD viewer from the software catalogue. They start a project next week. Low priority. Please do not install a random copy from a supplier.',
      'Standard software request for user {user}. The catalogue already lists the viewer. Plant {code}. No outage.',
      'Please push the licensed drawing viewer to one laptop. This is not an access-identity change and not a firewall request.',
      'Routine install request. The person can read PDF copies until the viewer arrives. {plant}.',
    ],
  },
  {
    key: 'sw-outlook',
    category: 'SOFTWARE',
    system: 'Standard software',
    urgency: 'MEDIUM',
    priority: 'P3',
    heldOut: false,
    articleTitle: 'Outlook will not open and the calendar profile is corrupt',
    steps: [
      'Confirm Outlook fails while Outlook on the web still opens. That separates a local profile fault from a mailbox outage.',
      'Start Outlook with a fresh profile. Do not delete the mailbox.',
      'If the old profile crashes on the calendar, recreate the profile and let it resync.',
      'Disable any non-catalogue add-in that loads at start.',
      'Leave MFA and the mailbox permissions unchanged.',
    ],
    resolution:
      'Outlook on the web worked, so the mailbox was healthy. Recreated the local profile after a calendar crash and disabled an unapproved add-in. Desktop Outlook opened.',
    titles: [
      'Outlook will not open on my laptop',
      'Calendar crash in the desktop mail client',
      'Need the mail profile rebuilt',
      'Desktop Outlook closes immediately',
    ],
    details: [
      'Outlook closes immediately on the laptop of {user} at {plant}. Outlook on the web still shows the mailbox, so mail is not down for the site. The calendar view seems to crash the desktop client.',
      'A medium software fault: the desktop mail profile is corrupt. The user can still reach mail in a browser. Plant {code}.',
      'Please rebuild the Outlook profile. An add-in may be crashing the calendar. This is one laptop, not an Exchange outage.',
      'Desktop Outlook will not stay open. Browser mail works. User is at {plant} and has a supplier meeting this afternoon.',
    ],
  },
  {
    key: 'sw-macro',
    category: 'SOFTWARE',
    system: 'Standard software',
    urgency: 'LOW',
    priority: 'P4',
    heldOut: false,
    articleTitle: 'Procurement spreadsheet macro is blocked by policy',
    steps: [
      'Confirm the file is the procurement workbook stored in the corporate library, not a personal download.',
      'Check the macro signature against the approved publisher list.',
      'If the publisher is approved, unblock that file. If it is not, refuse the macro and offer the catalogue workbook.',
      'Do not lower the Office macro policy for the whole plant.',
      'Record the file hash in the ticket.',
    ],
    resolution:
      'The workbook was an unsigned copy from a home drive. Provided the catalogue procurement workbook instead and left the macro policy unchanged.',
    titles: [
      'Excel macro blocked for the procurement sheet',
      'Spreadsheet will not run the approved macro',
      'Office policy stopped a workbook',
      'Need help with a blocked spreadsheet',
    ],
    details: [
      'The procurement workbook macro is blocked on one PC at {plant}. The user downloaded a copy to finish a report. Low priority. Please check whether it is the signed catalogue file before changing anything.',
      'Excel refuses a macro for {user}. Other Office apps work. Plant {code}. This can be handled as a standard software policy question.',
      'A spreadsheet from a home drive will not run. I suspect it is unsigned. Please point them at the approved workbook rather than weakening policy.',
      'Low urgency software request. The macro prompt says the publisher is not trusted. No finance close is at risk today.',
    ],
  },
  {
    key: 'sw-teams',
    category: 'SOFTWARE',
    system: 'Standard software',
    urgency: 'MEDIUM',
    priority: 'P3',
    heldOut: true,
    articleTitle: 'Teams crashes when the camera starts',
    steps: [
      'Confirm classic Teams or the new client, and whether the crash happens only when the camera starts.',
      'Update the camera driver from the hardware catalogue. Do not install a driver from a USB stick.',
      'Clear the Teams cache for that user profile and sign in again.',
      'Test a call with the camera off, then with the camera on.',
      'If it still crashes, swap the headset. Do not change network QoS for one laptop.',
    ],
    resolution:
      'Teams crashed only when the camera started. A catalogue camera driver and a cache reset fixed it. Network QoS was not changed.',
    titles: [
      'Teams crashes when I start the camera',
      'Supplier call drops because Teams closes',
      'Video meeting client crash on one laptop',
      'Need Teams stable for a call this afternoon',
    ],
    details: [
      'Teams closes as soon as {user} starts the camera during a supplier call. Chat still works. One laptop at {plant}. Medium priority software fault.',
      'The meeting client crashes on video only. Audio calls are fine. Plant {code}. Please do not treat this as a site VPN fault.',
      'A single laptop cannot keep Teams open when the camera turns on. They have a supplier meeting later today.',
      'Software crash in Teams tied to the camera. Other people in the same office are on calls without trouble.',
    ],
  },
  {
    key: 'cy-phish',
    category: 'CYBERSECURITY',
    system: 'Security operations',
    urgency: 'CRITICAL',
    priority: 'P1',
    heldOut: false,
    articleTitle: 'Employee submitted credentials to a payroll phishing page',
    steps: [
      'Treat the account as compromised. Reset the password and revoke all sessions immediately.',
      'Confirm whether the payroll or banking details were changed in the last day.',
      'Quarantine the phishing message for every recipient using the security gateway.',
      'Ask the user not to reuse the exposed password anywhere else.',
      'Do not remote-wipe a plant terminal unless the endpoint team finds malware. This ticket does not authorise firewall changes.',
    ],
    resolution:
      'Reset the exposed account, revoked sessions, and quarantined the payroll phishing message. Payroll details had not been changed. The endpoint team found no malware, so no device was wiped.',
    titles: [
      'I entered my password on a payroll phishing page',
      'Suspected credential theft from a fake payroll email',
      'Phishing link was clicked at {plant}',
      'Urgent security: payroll scam message',
    ],
    details: [
      'An employee at {plant} clicked a payroll phishing link and typed their password. The page was not the real portal. Please contain the account. This is a security incident, not a normal lockout.',
      'Credential phishing reported by {user}. The email claimed to be payroll and asked for a sign-in. They realised after submitting the form. Plant {code}.',
      'Critical cybersecurity: a fake payroll page may have captured a password this morning. The user still has their laptop. Please reset and check for mailbox rules.',
      'I think I was phished. The message was about payroll bank details. I entered my password before I noticed the strange URL. {plant}.',
    ],
  },
  {
    key: 'cy-usb',
    category: 'CYBERSECURITY',
    system: 'Security operations',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: false,
    articleTitle: 'Unknown USB stick found in the control room',
    steps: [
      'Do not plug the USB stick into a plant computer. Bag it and note where it was found.',
      'Ask the supervisor who was on shift and whether anyone saw it used.',
      'Hand the device to the endpoint team for a sandbox scan.',
      'If it was plugged in, isolate that PC from the business network and start the malware checklist.',
      'Do not connect the stick to a laptop to “see what is on it”.',
    ],
    resolution:
      'The USB stick was bagged and never plugged into a plant PC. Endpoint scanned it in the sandbox and found no malware. The control-room PCs stayed in service.',
    titles: [
      'Unknown USB found in the control room',
      'Suspicious memory stick on the supervisor desk',
      'Do not know who left this USB at {plant}',
      'Security: unclaimed USB in the plant office',
    ],
    details: [
      'A supervisor at {plant} found an unlabelled USB stick on the control-room desk. Nobody has claimed it. It has not been plugged in. Please advise the security process.',
      'Unknown removable media at plant {code}. The shift does not recognise it. High priority cybersecurity, but production systems are still running and the stick is in a drawer.',
      'User {user} wants the endpoint team to collect a suspicious USB. They did not open it. Control room, {plant}.',
      'Security request for an unclaimed memory stick. Please do not ask the operators to test it in a workstation.',
    ],
  },
  {
    key: 'cy-geo',
    category: 'CYBERSECURITY',
    system: 'Security operations',
    urgency: 'CRITICAL',
    priority: 'P1',
    heldOut: false,
    articleTitle: 'SAP sign-in from an unexpected country',
    steps: [
      'Confirm with the manager that the employee is not travelling.',
      'Revoke SAP and Azure AD sessions and force a password reset.',
      'Review the sign-in for the unexpected country and any new mailbox forwarding rules.',
      'If a forwarding rule exists, remove it and capture the destination address for the security log.',
      'Do not lock the whole plant directory because of one account.',
    ],
    resolution:
      'The user was not travelling. Sessions were revoked and the password reset. A new mailbox forwarding rule to an external address was removed. No plant-wide lockout was applied.',
    titles: [
      'SAP login from an unexpected country',
      'Impossible travel alert on an ERP account',
      'Mailbox forwarding appeared after a strange sign-in',
      'Critical: account used from overseas',
    ],
    details: [
      'Security alert: {user} at {plant} shows a SAP sign-in from an unexpected country. The employee is on shift locally. Please treat this as account compromise until proven otherwise.',
      'Impossible travel on an ERP identity. A mailbox rule may have been created. Plant {code}. The user did not travel. Critical cybersecurity.',
      'Azure AD flagged an overseas sign-in and then a new forwarding rule. The real user is at {plant} and cannot explain it.',
      'Please contain one account. The directory alert says the login country changed overnight. This is not a normal password lockout.',
    ],
  },
  {
    key: 'cy-share',
    category: 'CYBERSECURITY',
    system: 'Security operations',
    urgency: 'HIGH',
    priority: 'P2',
    heldOut: true,
    articleTitle: 'Controlled drawing sent to a personal mailbox',
    steps: [
      'Identify the file, the sender, and the personal mailbox address from the data-loss log.',
      'Confirm with Engineering whether the drawing is controlled or export-restricted.',
      'If it is controlled, ask the sender to delete the personal copy and reply with confirmation.',
      'Remove any share link and record the incident for the data owner.',
      'Do not email the drawing again as part of the investigation.',
    ],
    resolution:
      'The drawing was controlled. The sender deleted the personal copy and the share link was removed. Engineering recorded the disclosure. The file was not forwarded again by IT.',
    titles: [
      'Controlled drawing emailed to a personal account',
      'Data-loss alert on an engineering file',
      'Sensitive drawing left the company mailbox',
      'Please review a personal-mail share',
    ],
    details: [
      'The data-loss log shows {user} at {plant} sent a controlled drawing to a personal mailbox. Engineering thinks the file is restricted. High priority cybersecurity. Production is not stopped.',
      'A sensitive drawing may have left the company. Plant {code}. Please follow the disclosure steps and do not attach the file to the ticket notes.',
      'Security alert for a personal-mail share of an engineering drawing. The user says they wanted to print it at home. That is not allowed for a controlled drawing.',
      'Please contain a data-loss event. One drawing, one personal address, sender is on site at {plant}.',
    ],
  },
];

export function materialiseRecords(): {
  split: 'TRAIN' | 'VAL' | 'TEST';
  title: string;
  description: string;
  category: Scenario['category'];
  urgency: Scenario['urgency'];
  priority: Scenario['priority'];
  scenarioKey: string;
  requesterRole: string;
  affectedSystem: string;
  goldResolution: string;
}[] {
  const records = [];
  for (const scenario of scenarios) {
    for (let i = 0; i < 8; i += 1) {
      const sample = expandScenario(scenario, i);
      const bucket = (i + scenario.key.length) % 10;
      const split: 'TRAIN' | 'VAL' | 'TEST' = bucket <= 5 ? 'TRAIN' : bucket === 6 ? 'VAL' : 'TEST';
      records.push({
        split,
        title: sample.title,
        description: sample.description,
        category: scenario.category,
        urgency: scenario.urgency,
        priority: scenario.priority,
        scenarioKey: scenario.key,
        requesterRole: 'EMPLOYEE',
        affectedSystem: scenario.system,
        goldResolution: scenario.resolution
        .replaceAll('{plant}', 'the affected plant')
        .replaceAll('{code}', 'the plant code')
        .replaceAll('{po}', 'the purchase order')
        .replaceAll('{user}', 'the requester'),
      });
    }
  }
  return records;
}

function guidance(text: string): string {
  return text
    .replaceAll('{plant}', 'the affected plant')
    .replaceAll('{code}', 'the plant code')
    .replaceAll('{po}', 'the purchase order')
    .replaceAll('{user}', 'the requester');
}

export function articleBody(scenario: Scenario): string {
  return guidance([
    scenario.articleTitle,
    `Category: ${scenario.category}. System: ${scenario.system}.`,
    'Approved troubleshooting guidance for Northline Manufacturing service desk technicians.',
    ...scenario.steps.map((step, index) => `${index + 1}. ${step}`),
    `Known successful resolution: ${scenario.resolution}`,
    'The technician remains responsible for the action. Do not restart plant servers, change firewall rules, or close the ticket without a human review.',
  ].join('\n'));
}
