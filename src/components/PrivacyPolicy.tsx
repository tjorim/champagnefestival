import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>{t('privacy.title', 'Privacy Policy')}</DialogTitle>
            <DialogClose asChild>
              <button
                className="rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:text-muted-foreground"
                aria-label={t('close', 'Close')}
              >
                <X className="h-4 w-4" />
              </button>
            </DialogClose>
          </div>
          <DialogDescription>
            {t('privacy.lastUpdated', 'Last Updated')}: {t('privacy.lastUpdatedDate', 'March 2025')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <p>
            {t('privacy.intro', 'This Privacy Policy explains how we collect, use, and protect your personal information when you use our website or services.')}
          </p>

          <Separator className="my-4" />

          <div>
            <h3 className="text-lg font-medium mb-2">
              {t('privacy.dataCollection.title', 'Information We Collect')}
            </h3>
            <p className="text-muted-foreground">
              {t('privacy.dataCollection.content', 'When you use our contact form, we may collect your name, email address, and any message content you provide. This information is only used to respond to your inquiries.')}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">
              {t('privacy.dataUse.title', 'How We Use Your Information')}
            </h3>
            <p className="text-muted-foreground">
              {t('privacy.dataUse.content', 'We use the information you provide through our contact form solely to respond to your inquiries and communicate with you about the Champagne Festival.')}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">
              {t('privacy.dataProtection.title', 'How We Protect Your Information')}
            </h3>
            <p className="text-muted-foreground">
              {t('privacy.dataProtection.content', 'We implement appropriate security measures to protect your personal information from unauthorized access, alteration, or disclosure.')}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">
              {t('privacy.cookies.title', 'Cookies and Similar Technologies')}
            </h3>
            <p className="text-muted-foreground">
              {t('privacy.cookies.content', 'Our website may use cookies to enhance your browsing experience. You can set your browser to refuse cookies, but this may limit some functionality.')}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">
              {t('privacy.contactUs.title', 'Contact Us')}
            </h3>
            <p className="text-muted-foreground">
              {t('privacy.contactUs.content', 'If you have any questions about our privacy policy, please contact us using the contact form on our website.')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrivacyPolicy;