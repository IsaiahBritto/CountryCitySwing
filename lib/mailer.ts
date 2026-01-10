import nodemailer from "nodemailer";

export const sendMail = async (subject: string, body: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: "isaiah.countrycityswing@gmail.com",
    subject,
    text: body,
  });
};
