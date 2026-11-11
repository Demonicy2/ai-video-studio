import React from 'react';
import './globals.css';

export const metadata = {
  title: 'AI Video Studio — Tạo video AI từ kịch bản',
  description: 'Biến ý tưởng hoặc kịch bản thành video ngắn chuyên nghiệp với AI Storyboard, Video & TTS.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}

