import nodemailer, { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Mail from 'nodemailer/lib/mailer';
import LOG from 'loglevel';

export type SmtpOptions = SMTPTransport.Options;

export interface Notifier {
  sendActivationCode(email: string, activationCode: string): Promise<unknown>;
}

export const logNotifier: Notifier = {
  async sendActivationCode(email: string, activationCode: string) {
    LOG.info(`Activation code for ${email}: ${activationCode}`);
  }
}

export class SmtpNotifier implements Notifier {
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private readonly from: string | Mail.Address | undefined;
  private readonly domain: string;

  /**
   * @param options SMTP options
   * @param name gateway domain, used as a default self hostname
   * @see https://community.nodebb.org/post/81300
   */
  constructor({ smtp: options, '@domain': name }: {
    smtp?: SmtpOptions, // optional only for type
    '@domain': string
  }) {
    this.transporter = nodemailer.createTransport({ name, ...options });
    this.from = options?.from;
    const address = typeof options?.from == 'object' ?
      options.from.address : options?.from;
    let [, domain] = address?.match(/@(\w+)/) || [];
    this.domain = domain || 'm-ld-gateway';
  }

  sendActivationCode(email: string, activationCode: string) {
    return this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: `Hi from ${this.domain}`, // Subject line
      text: `Your activation code is ${activationCode}\n\n` +
        'This code is usable for the next 10 minutes.\n' +
        'Cheers,\n' +
        `the ${this.domain} team`
    });
  }
}