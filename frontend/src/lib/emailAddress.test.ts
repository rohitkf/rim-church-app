import { describe, expect, it } from 'vitest'
import { emailMeant, emailProblem, isEmailAddress } from './emailAddress'

/*
 * "People are typing .con in the end instead of .com and since it's
 * going through, Resend fails." An address is refused when it cannot be
 * one, for the reason it cannot, with the one they meant beside it.
 */
describe('an email address that can be one', () => {
  it.each([
    'ama@example.com',
    'Ama.Serwaa@Example.COM',
    'ama+church@gmail.com',
    'a@b.co',
    'ama_serwaa-2@sub.domain.co.uk',
    "o'brien@example.ie",
    'ama@example.church',
    'ama@example.cm', // Cameroon: one key from .com, and real
    'ama@example.om', // Oman
    'ama@xn--80ak6aa92e.xn--p1ai',
    '  ama@example.com  ', // the space a phone's keyboard leaves
  ])('takes %s', (address) => {
    expect(emailProblem(address)).toBeNull()
    expect(isEmailAddress(address)).toBe(true)
  })
})

describe('an ending that does not exist', () => {
  it('refuses .con, says there is no such ending, and offers .com', () => {
    const problem = emailProblem('ama@gmail.con')
    expect(problem?.text).toBe('Email addresses do not end in “.con”. Check the end of yours.')
    expect(problem?.meant).toBe('ama@gmail.com')
    expect(isEmailAddress('ama@gmail.con')).toBe(false)
  })

  it('does so on anybody’s domain, not only the well-known ones', () => {
    expect(emailProblem('office@rehoboth-ministries.con')?.meant).toBe('office@rehoboth-ministries.com')
    expect(emailProblem('ama@btinternet.con')?.meant).toBe('ama@btinternet.com')
  })

  it.each([
    ['ama@gmail.cmo', 'ama@gmail.com'], // two the wrong way round
    ['ama@gmail.ocm', 'ama@gmail.com'],
    ['ama@gmail.vom', 'ama@gmail.com'], // the key beside
    ['ama@gmail.xom', 'ama@gmail.com'],
    ['ama@gmail.comm', 'ama@gmail.com'], // one too many
    ['ama@gmail.coom', 'ama@gmail.com'],
    ['ama@gmail.c0m', 'ama@gmail.com'],
    ['ama@example.nte', 'ama@example.net'],
    ['ama@example.ogr', 'ama@example.org'],
    ['ama@example.orgg', 'ama@example.org'],
    ['ama@hotmail.co.ku', 'ama@hotmail.co.uk'],
    ['ama@hotmail.couk', 'ama@hotmail.co.uk'],
    ['Ama@Gmail.CON', 'Ama@Gmail.com'],
  ])('offers the ending meant: %s', (typed, meant) => {
    const problem = emailProblem(typed)
    expect(problem).not.toBeNull()
    expect(problem?.meant).toBe(meant)
  })

  it('refuses an ending that is nothing like a real one, and offers nothing', () => {
    const problem = emailProblem('ama@example.qqqzz')
    expect(problem?.text).toBe('Email addresses do not end in “.qqqzz”. Check the end of yours.')
    expect(problem?.meant).toBeNull()
  })

  it('never offers an address that is itself wrong', () => {
    for (const typed of ['ama@gmail.con', 'ama@x.cmo', 'ama@hotmail.couk', 'ama@gmail,con', 'ama@gmail.con.']) {
      const meant = emailProblem(typed)?.meant
      expect(meant, typed).toBeTruthy()
      expect(emailProblem(meant!), typed).toBeNull()
    }
  })
})

describe('an address that is not shaped like one', () => {
  const shape = 'That email address doesn’t look right. It should be like name@example.com.'

  it.each(['ama', 'ama@', '@gmail.com', 'ama@gmail', 'ama@@gmail.com', 'ama@gm@il.com', 'ama@-gmail.com', 'ama@gmail-.com', '.ama@gmail.com', 'ama.@gmail.com', 'a..b@gmail.com', 'ama@.com', 'ama(at)gmail.com', 'ama@gmail.com;'])(
    'refuses %s',
    (address) => {
      expect(emailProblem(address)?.text).toBe(shape)
    },
  )

  it.each([
    ['ama@gmail,com', 'ama@gmail.com'], // the comma beside the full stop
    ['ama @gmail.com', 'ama@gmail.com'],
    ['ama@gmail. com', 'ama@gmail.com'],
    ['ama@gmail..com', 'ama@gmail.com'],
    ['ama@gmail.com.', 'ama@gmail.com'],
    ['ama@gmail,con', 'ama@gmail.com'], // two slips at once
  ])('mends what a keyboard does: %s', (typed, meant) => {
    const problem = emailProblem(typed)
    expect(problem?.text).toBeTruthy()
    expect(problem?.meant).toBe(meant)
  })

  it('offers nothing where the mending would be a guess', () => {
    expect(emailProblem('ama@gmail')?.meant).toBeNull()
    expect(emailProblem('ama')?.meant).toBeNull()
    expect(emailProblem('ama@@gmail.com')?.meant).toBeNull()
  })

  it('says an empty box is empty', () => {
    expect(emailProblem('   ')).toEqual({ text: 'Enter an email address.', meant: null })
  })

  it('refuses one too long to be an address', () => {
    expect(emailProblem(`${'a'.repeat(65)}@example.com`)?.text).toBe(shape)
    expect(emailProblem(`ama@${'a'.repeat(250)}.com`)?.text).toBe(shape)
  })
})

describe('the address they probably meant', () => {
  it('is the mended one for an address that cannot be one', () => {
    expect(emailMeant('ama@gmail.con')).toBe('ama@gmail.com')
  })

  it('is still offered for a slip that could be a real address, which is not refused', () => {
    expect(emailProblem('ama@gmial.com')).toBeNull()
    expect(emailMeant('ama@gmial.com')).toBe('ama@gmail.com')
    expect(emailProblem('ama@gmail.co')).toBeNull()
    expect(emailMeant('ama@gmail.co')).toBe('ama@gmail.com')
  })

  it('is nothing for an address with nothing wrong', () => {
    expect(emailMeant('ama@example.com')).toBeNull()
  })
})
