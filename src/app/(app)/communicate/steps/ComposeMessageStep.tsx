"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ComposeMessageStepProps {
  content: string;
  onChange: (content: string) => void;
  subject: string;
  onSubjectChange: (subject: string) => void;
  onBack: () => void;
  onNext: () => void;
}

const MESSAGE_TEMPLATES = [
  {
    id: "thank-you",
    name: "Thank You",
    subject: "Thank You for Your Support",
    content:
      "Dear [Donor Name],\n\nThank you for your generous support. Your contribution helps us make a real difference in our community. We are grateful for your partnership in our mission.\n\nBest regards,\n[Organization Name]",
  },
  {
    id: "update",
    name: "Project Update",
    subject: "Update on Our Progress",
    content:
      "Dear [Donor Name],\n\nWe wanted to share some exciting updates about the impact your support is making. Thanks to donors like you, we've been able to achieve significant progress in our initiatives.\n\nBest regards,\n[Organization Name]",
  },
  {
    id: "event",
    name: "Event Invitation",
    subject: "Join Us for a Special Event",
    content:
      "Dear [Donor Name],\n\nWe would like to invite you to an upcoming event where you can see firsthand the impact of your support. We would be honored to have you join us.\n\nBest regards,\n[Organization Name]",
  },
  // Add more templates as needed
];

export function ComposeMessageStep({
  content,
  onChange,
  subject,
  onSubjectChange,
  onBack,
  onNext,
}: ComposeMessageStepProps) {
  const handleTemplateSelect = (templateId: string) => {
    const template = MESSAGE_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      onSubjectChange(template.subject);
      onChange(template.content);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Compose Message</h3>
        <p className="text-sm text-muted-foreground">Write your message or select a template to get started.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="templates">Message Templates</Label>
        <div className="flex gap-2 flex-wrap">
          {MESSAGE_TEMPLATES.map((template) => (
            <Button key={template.id} variant="outline" onClick={() => handleTemplateSelect(template.id)}>
              {template.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Enter message subject..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Message</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Write your message here..."
          className="min-h-[200px]"
        />
      </div>

      <div className="text-sm text-muted-foreground">
        Available placeholders:
        <ul className="list-disc list-inside mt-1">
          <li>[Donor Name] - will be replaced with the donor&apos;s name</li>
          <li>[Organization Name] - will be replaced with your organization&apos;s name</li>
        </ul>
      </div>

      <div className="flex justify-between items-center pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!subject.trim() || !content.trim()}>
          Next
        </Button>
      </div>
    </div>
  );
}
