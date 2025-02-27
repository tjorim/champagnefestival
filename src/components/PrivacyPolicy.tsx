import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { XMarkIcon } from '@heroicons/react/24/solid';

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-darkCard rounded-lg p-6 max-w-md w-full max-h-[85vh] overflow-y-auto z-50 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <Dialog.Title className="text-xl font-semibold text-white">
              {t('privacy.title', 'Privacy Policy')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button 
                className="text-gray-400 hover:text-white p-1 rounded-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                aria-label={t('close', 'Close')}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          
          <div className="space-y-4 text-gray-300">
            <p>
              {t('privacy.intro', 'This Privacy Policy explains how we collect, use, and protect your personal information when you use our website or services.')}
            </p>
            
            <h3 className="text-lg font-medium text-white mt-4">
              {t('privacy.dataCollection.title', 'Information We Collect')}
            </h3>
            <p>
              {t('privacy.dataCollection.content', 'When you use our contact form, we may collect your name, email address, and any message content you provide. This information is only used to respond to your inquiries.')}
            </p>
            
            <h3 className="text-lg font-medium text-white mt-4">
              {t('privacy.dataUse.title', 'How We Use Your Information')}
            </h3>
            <p>
              {t('privacy.dataUse.content', 'We use the information you provide through our contact form solely to respond to your inquiries and communicate with you about the Champagne Festival.')}
            </p>
            
            <h3 className="text-lg font-medium text-white mt-4">
              {t('privacy.dataProtection.title', 'How We Protect Your Information')}
            </h3>
            <p>
              {t('privacy.dataProtection.content', 'We implement appropriate security measures to protect your personal information from unauthorized access, alteration, or disclosure.')}
            </p>
            
            <h3 className="text-lg font-medium text-white mt-4">
              {t('privacy.cookies.title', 'Cookies and Similar Technologies')}
            </h3>
            <p>
              {t('privacy.cookies.content', 'Our website may use cookies to enhance your browsing experience. You can set your browser to refuse cookies, but this may limit some functionality.')}
            </p>
            
            <h3 className="text-lg font-medium text-white mt-4">
              {t('privacy.contactUs.title', 'Contact Us')}
            </h3>
            <p>
              {t('privacy.contactUs.content', 'If you have any questions about our privacy policy, please contact us using the contact form on our website.')}
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PrivacyPolicy;