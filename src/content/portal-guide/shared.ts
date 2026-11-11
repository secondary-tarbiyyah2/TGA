// Pages everyone can open, outside the role areas: your account, Report a
// concern, documents to sign, your feedback and installing the app.
import type { GuideEntry, GuideRole } from "./types";

export const HELP_CATEGORY = "Your account and help";

const isPupil = (r: GuideRole) => r === "pupil";
const isStaff = (r: GuideRole) => r !== "pupil" && r !== "parent";

export function accountEntry(r: GuideRole): GuideEntry {
  return {
    href: "/account",
    name: "Your account",
    category: HELP_CATEGORY,
    purpose: isPupil(r) ? "Change your password and your settings." : "Your password, notifications and preferences.",
    when: isPupil(r) ? "When you want a new password." : "When you change your password or how the portal tells you about things.",
    steps: isPupil(r)
      ? ["Open your name at the bottom of the menu.", "Type a New password and type it again in Confirm.", "Save it."]
      : [
          "Open your name at the bottom of the menu.",
          "Under Password, type a new password twice and save.",
          "Turn Notifications on this device on or off.",
          ...(r === "parent" ? ["Set a Parent PIN to lock the family area, and choose whether you get the Weekly email."] : ["Choose whether people see Read receipts on your messages."]),
          "Open Your feedback to follow anything you reported.",
        ],
    tips: [isPupil(r) ? "Never tell anyone your password, even a friend." : "The password checklist shows when your new password is strong enough."],
    privacy: "Only you can see and change your account.",
    related: ["/feedback"],
    showMe: [{ target: "account-password", label: "Password", say: "Change your password here." }],
    tasks: ["change my password", ...(isPupil(r) ? [] : ["turn on notifications"])],
  };
}

export function reportConcernEntry(r: GuideRole): GuideEntry {
  return {
    href: "/report-concern",
    name: "Report a concern",
    category: isStaff(r) ? "Safeguarding and SEND" : HELP_CATEGORY,
    purpose: isPupil(r) ? "Tell a safe adult at school if you are worried about yourself or someone else." : "Tell the safeguarding team about a worry for a child's safety or wellbeing.",
    when: isPupil(r) ? "Any time something worries you." : "As soon as you are worried. In an emergency, call the emergency services first.",
    steps: isPupil(r)
      ? ["Press Report a concern at the top of any page.", "Say who or what it is about.", "Say how urgent it feels.", "Write what happened and send it."]
      : [
          "Press Report a concern (top right of every page).",
          "Fill in Who or what is this about? and a Category if you know one.",
          "Choose How urgent does this feel? (Low to Urgent).",
          "Write What happened? in your own words, with dates and what was said.",
          "Send it. You will see Thank you when it has gone.",
        ],
    tips: [isPupil(r) ? "If you are in danger right now, tell a grown-up near you or call 999." : "Do not investigate or promise to keep it secret; pass it on and let the safeguarding lead decide."],
    privacy: isPupil(r) ? "Only the school's safeguarding team reads it." : "Only the safeguarding team reads it. It never goes to the family or other staff.",
    related: ["/account"],
    showMe: [{ target: "concern-form", label: "The form", say: "Who, how urgent and what happened." }],
    tasks: ["report a safeguarding concern", "I am worried about a child"],
  };
}

export function documentsEntry(r: GuideRole): GuideEntry {
  return {
    href: "/documents",
    name: "My documents",
    category: HELP_CATEGORY,
    purpose: isPupil(r) ? "Things the school asks you to read and sign." : "Policies and forms the school asks you to read and sign, and the ones you have signed.",
    when: "When the portal shows a document waiting for your signature.",
    steps: ["Under Pending your signature, press Open document and read it.", "Type your full name, or draw your signature.", "Tick I confirm I have read and understood this document, then sign.", "Find what you signed under Signed by you, with a Receipt."],
    tips: ["You also get a copy of the signed PDF by email."],
    privacy: "The school office sees who has signed.",
    related: ["/account"],
    showMe: [{ target: "documents-pending", label: "Pending your signature", say: "Documents waiting for you." }],
    tasks: ["sign a document", "sign a policy"],
  };
}

export function feedbackEntry(r: GuideRole): GuideEntry {
  return {
    href: "/feedback",
    name: "Your feedback",
    category: HELP_CATEGORY,
    purpose: isPupil(r) ? "Problems or ideas you sent about the portal, and the school's replies." : "Everything you sent with the Feedback button, its progress and the school's reply.",
    when: "After you report a problem or suggest something.",
    steps: ["Press Feedback at the top of any page to send something new.", "Choose what it is about and write a short summary and details.", "Come back here to read the reply."],
    tips: ["You can paste a screenshot straight into the Details box."],
    privacy: "Only you and the head teacher or admin see your feedback.",
    related: ["/account"],
    showMe: [{ target: "feedback-list", label: "Your feedback", say: "Everything you sent, with replies." }],
    tasks: ["report a problem with the portal", "suggest an improvement"],
  };
}

export function installEntry(r: GuideRole): GuideEntry {
  return {
    href: "/install",
    name: "Install the app",
    category: HELP_CATEGORY,
    purpose: isPupil(r) ? "Put the portal on your tablet or phone like an app." : "Put the portal on your phone, tablet or computer with its own icon. Free, no app store.",
    when: "Once, on each device you use.",
    steps: ["Open this page on the device you want the app on.", "Press Install TGA Portal if your browser offers it.", "Otherwise open Step by step for your device (Android, iPhone or iPad, Windows or Mac) and follow it."],
    tips: ["Installing also lets you turn on notifications on phones."],
    privacy: "Nothing is shared by installing.",
    related: ["/account"],
    showMe: [{ target: "install-guide", label: "Install", say: "Steps for your device." }],
    tasks: ["install the app"],
  };
}

export function sharedEntries(r: GuideRole): GuideEntry[] {
  // Teachers and the SENCo have Report a concern in their menu already; a
  // SENCo-only account has no documents page.
  const concernInMenu = r === "teacher" || r === "senco";
  return [accountEntry(r), ...(concernInMenu ? [] : [reportConcernEntry(r)]), ...(r === "senco" ? [] : [documentsEntry(r)]), feedbackEntry(r), installEntry(r)];
}
