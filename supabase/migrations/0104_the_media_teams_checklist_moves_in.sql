/*
 * The media team's checklist, as the team actually works it.
 *
 * The team has been running off a spreadsheet: six columns, one per role,
 * pre-service down the top half and post-service underneath. It is a good
 * checklist — it has the things people only learn by getting them wrong,
 * like not shooting an empty row of chairs, and taping the choir's
 * positions to the floor so they land in the same place next week. But it
 * lives in a spreadsheet, so it is not what anybody ticks on a Sunday, and
 * the app's own list had a handful of items against two roles and nothing
 * against the other four.
 *
 * This is that spreadsheet, moved in.
 *
 * **Nothing is deleted.** The items already in the app include several the
 * sheet has never had, and one of them already carries a progress row for
 * a service. So existing items are reworded in place, keeping their ids
 * and anything ticked against them, and the rest are added around them.
 *
 * **Both sheets, one list.** There are English and Malayalam versions and
 * they differ in exactly one line — which language VerseView is set to. A
 * checklist item belongs to a role rather than to a service, so that is
 * one item naming both, read on the day by the person doing it.
 *
 * Vision Mixer is left alone deliberately: it has no column in the sheet,
 * and inventing one would be guessing at what somebody's job is.
 */

-- Wording that drifted: the same step, said the way the rest of the list says it.

update public.department_role_checklist_items i set label = 'Get the service planner'
  from public.department_roles r, public.departments d
 where r.id = i.role_id and d.id = i.department_id
   and d.name = 'Media' and r.name = 'Team Coordinator' and i.label = 'Get the Service Planner';

update public.department_role_checklist_items i set label = 'Run a trial stream on YouTube'
  from public.department_roles r, public.departments d
 where r.id = i.role_id and d.id = i.department_id
   and d.name = 'Media' and r.name = 'Director' and i.label = 'Run Trial on YT';

update public.department_role_checklist_items i set label = 'Set up the choir positions'
  from public.department_roles r, public.departments d
 where r.id = i.role_id and d.id = i.department_id
   and d.name = 'Media' and r.name = 'Director' and i.label = 'Setup positions for choir';

update public.department_role_checklist_items i set label = 'Tape the choir positions on the floor'
  from public.department_roles r, public.departments d
 where r.id = i.role_id and d.id = i.department_id
   and d.name = 'Media' and r.name = 'Director' and i.label = 'Tape the positions for choir';

update public.department_role_checklist_items i set label = 'Set up the stage lighting'
  from public.department_roles r, public.departments d
 where r.id = i.role_id and d.id = i.department_id
   and d.name = 'Media' and r.name = 'Director' and i.label = 'Setup proper lighting';

update public.department_role_checklist_items i set label = 'Check the live stream is running'
  from public.department_roles r, public.departments d
 where r.id = i.role_id and d.id = i.department_id
   and d.name = 'Media' and r.name = 'Director' and i.label = 'Livestream is ON';

update public.department_role_checklist_items i set label = 'Check the recording is turned on'
  from public.department_roles r, public.departments d
 where r.id = i.role_id and d.id = i.department_id
   and d.name = 'Media' and r.name = 'Director' and i.label = 'Recording is turned ON';

update public.department_role_checklist_items i set label = 'End the live stream'
  from public.department_roles r, public.departments d
 where r.id = i.role_id and d.id = i.department_id
   and d.name = 'Media' and r.name = 'Director' and i.label = 'End Live Stream';



/*
 * The wanted list, as a scratch table rather than a repeated VALUES block.
 *
 * Not `on commit drop`: migrations are replayed a file at a time through
 * psql, where every statement commits on its own, and a table that goes
 * at the first commit is gone before the next line can fill it. Dropped
 * explicitly at the end instead, which holds whether this runs statement
 * by statement or all inside one transaction.
 */
create temp table wanted (role_name text, phase text, sort_order integer, label text);

insert into wanted (role_name, phase, sort_order, label) values
    ('Team Coordinator', 'pre', 1, 'Get the service planner'),
    ('Team Coordinator', 'pre', 2, 'Check in with the Director'),
    ('Team Coordinator', 'pre', 3, 'Check the live stream is scheduled and ready'),
    ('Team Coordinator', 'pre', 4, 'Check VerseView is ready'),
    ('Team Coordinator', 'pre', 5, 'Check the camera operators are ready and connected'),
    ('Team Coordinator', 'pre', 6, 'Check the TV is not tilted'),
    ('Team Coordinator', 'pre', 7, 'Check the podium is centred'),
    ('Team Coordinator', 'pre', 8, 'Check the choir positioning'),
    ('Team Coordinator', 'pre', 9, 'Check the stage lights are set up'),
    ('Team Coordinator', 'pre', 10, 'Check the stage LED lamps are set up'),
    ('Team Coordinator', 'pre', 11, 'Troubleshoot the Blackmagic if needed'),
    ('Team Coordinator', 'pre', 12, 'Troubleshoot VerseView if needed'),
    ('Team Coordinator', 'pre', 13, 'Troubleshoot the cameras if needed'),
    ('Team Coordinator', 'post', 1, 'Check the live stream ended properly'),
    ('Team Coordinator', 'post', 2, 'Check the cables are coiled and stored correctly'),
    ('Team Coordinator', 'post', 3, 'Check the cameras are packed properly'),
    ('Team Coordinator', 'post', 4, 'Check the camera case for anything missing'),
    ('Team Coordinator', 'post', 5, 'Remove the SSD from the recorder and pack it'),
    ('Team Coordinator', 'post', 6, 'Help the team finish packing'),
    ('Director', 'pre', 1, 'Read the service schedule'),
    ('Director', 'pre', 2, 'Coordinate with the camera operators'),
    ('Director', 'pre', 3, 'Check the camera frames on the Blackmagic'),
    ('Director', 'pre', 4, 'Connect broadcast audio'),
    ('Director', 'pre', 5, 'Monitor broadcast sound'),
    ('Director', 'pre', 6, 'Set up the choir positions'),
    ('Director', 'pre', 7, 'Tape the choir positions on the floor'),
    ('Director', 'pre', 8, 'Check the camera and choir positioning'),
    ('Director', 'pre', 9, 'Set up the stage lighting'),
    ('Director', 'pre', 10, 'Check the left and right LED lamps are positioned correctly'),
    ('Director', 'pre', 11, 'Check the lighting and colour temperature'),
    ('Director', 'pre', 12, 'Run a trial stream on YouTube'),
    ('Director', 'pre', 13, 'Check the sound on the live stream'),
    ('Director', 'pre', 14, 'Check the live stream is running'),
    ('Director', 'pre', 15, 'Check the recording is turned on'),
    ('Director', 'post', 1, 'Stop the recording'),
    ('Director', 'post', 2, 'End the live stream'),
    ('Director', 'post', 3, 'Check the live stream ended properly'),
    ('Director', 'post', 4, 'Edit or trim the recording if needed'),
    ('Director', 'post', 5, 'Check the cameras and cables are packed properly'),
    ('Presentation Operator', 'pre', 1, 'Check all the songs are available'),
    ('Presentation Operator', 'pre', 2, 'Prepare and schedule the songs'),
    ('Presentation Operator', 'pre', 3, 'Check the connection to the HDMI splitter'),
    ('Presentation Operator', 'pre', 4, 'Check the connection to both TVs'),
    ('Presentation Operator', 'pre', 5, 'Check the OBS output and confidence monitor are working'),
    ('Presentation Operator', 'pre', 6, 'Run a trial of the Bible verses and songs'),
    ('Presentation Operator', 'pre', 7, 'Check the background colour matches the stage and thumbnail'),
    ('Presentation Operator', 'pre', 8, 'Adjust the confidence monitor brightness so it does not show on the main TV'),
    ('Presentation Operator', 'pre', 9, 'Set the primary language to match the service — English or Malayalam'),
    ('Presentation Operator', 'post', 1, 'Close VerseView'),
    ('Presentation Operator', 'post', 2, 'Disconnect the cables'),
    ('Presentation Operator', 'post', 3, 'Coil the cables properly into the media box'),
    ('Presentation Operator', 'post', 4, 'Coil the two HDMI cables running to the TVs'),
    ('Presentation Operator', 'post', 5, 'Help coil the battery cables'),
    ('Camera Operator 1', 'pre', 1, 'Charge the camera and TX batteries'),
    ('Camera Operator 1', 'pre', 2, 'Unpack and set up the tripod'),
    ('Camera Operator 1', 'pre', 3, 'Unpack the camera'),
    ('Camera Operator 1', 'pre', 4, 'Check the lens for fingerprints'),
    ('Camera Operator 1', 'pre', 5, 'Clean the lens if needed'),
    ('Camera Operator 1', 'pre', 6, 'Assemble the camera, TX, dummy battery and HDMI cable'),
    ('Camera Operator 1', 'pre', 7, 'Turn on the RX and check the feed reaches the Blackmagic'),
    ('Camera Operator 1', 'pre', 8, 'Read the service schedule'),
    ('Camera Operator 1', 'pre', 9, 'Set the frame for the trial run on YouTube'),
    ('Camera Operator 1', 'pre', 10, 'Set the white balance'),
    ('Camera Operator 1', 'pre', 11, 'Set the ISO'),
    ('Camera Operator 1', 'pre', 12, 'Set the exposure'),
    ('Camera Operator 1', 'post', 1, 'Disassemble the camera and TX'),
    ('Camera Operator 1', 'post', 2, 'Pack the tripod'),
    ('Camera Operator 1', 'post', 3, 'Store the camera, TX, mount and HDMI cable in the case'),
    ('Camera Operator 1', 'post', 4, 'Coil the cables back into the media room'),
    ('Camera Operator 2', 'pre', 1, 'Charge the camera and TX batteries'),
    ('Camera Operator 2', 'pre', 2, 'Unpack and set up the tripod'),
    ('Camera Operator 2', 'pre', 3, 'Unpack the camera'),
    ('Camera Operator 2', 'pre', 4, 'Check the lens for fingerprints'),
    ('Camera Operator 2', 'pre', 5, 'Clean the lens if needed'),
    ('Camera Operator 2', 'pre', 6, 'Assemble the camera, TX, battery and HDMI cable'),
    ('Camera Operator 2', 'pre', 7, 'Connect the blue SDI cable to the RX'),
    ('Camera Operator 2', 'pre', 8, 'Turn on the RX and check the feed reaches the Blackmagic'),
    ('Camera Operator 2', 'pre', 9, 'Read the service schedule'),
    ('Camera Operator 2', 'pre', 10, 'Set the frame for the trial run on YouTube'),
    ('Camera Operator 2', 'pre', 11, 'Set the white balance'),
    ('Camera Operator 2', 'pre', 12, 'Set the ISO'),
    ('Camera Operator 2', 'pre', 13, 'Set the exposure'),
    ('Camera Operator 2', 'post', 1, 'Disassemble the camera and TX'),
    ('Camera Operator 2', 'post', 2, 'Pack the tripod'),
    ('Camera Operator 2', 'post', 3, 'Store the camera, TX, mount and HDMI cable in the case'),
    ('Camera Operator 2', 'post', 4, 'Coil the cables back into the media room'),
    ('Camera Operator 3', 'pre', 1, 'Charge the camera and TX batteries'),
    ('Camera Operator 3', 'pre', 2, 'Unpack and set up the tripod'),
    ('Camera Operator 3', 'pre', 3, 'Unpack the camera'),
    ('Camera Operator 3', 'pre', 4, 'Check the lens for fingerprints'),
    ('Camera Operator 3', 'pre', 5, 'Clean the lens if needed'),
    ('Camera Operator 3', 'pre', 6, 'Assemble the camera, TX, battery and HDMI cable'),
    ('Camera Operator 3', 'pre', 7, 'Turn on the RX and check the feed reaches the Blackmagic'),
    ('Camera Operator 3', 'pre', 8, 'Read the service schedule'),
    ('Camera Operator 3', 'pre', 9, 'Set the frame for the trial run on YouTube'),
    ('Camera Operator 3', 'pre', 10, 'Set the white balance'),
    ('Camera Operator 3', 'pre', 11, 'Set the ISO'),
    ('Camera Operator 3', 'pre', 12, 'Set the exposure'),
    ('Camera Operator 3', 'pre', 13, 'Do not shoot white backgrounds or empty chairs'),
    ('Camera Operator 3', 'post', 1, 'Disassemble the camera and TX'),
    ('Camera Operator 3', 'post', 2, 'Pack the tripod'),
    ('Camera Operator 3', 'post', 3, 'Store the camera, TX, mount and HDMI cable in the case'),
    ('Camera Operator 3', 'post', 4, 'Coil the cables back into the media room');

/*
 * Add what is missing and put the whole list in order.
 *
 * Matched on the label, so re-running this changes nothing: an item that
 * is already there keeps its id — and its ticks — and only moves to the
 * position the list says it should be in.
 */
insert into public.department_role_checklist_items (role_id, department_id, label, phase, sort_order)
select r.id, d.id, w.label, w.phase, w.sort_order
  from wanted w
  join public.departments d on d.name = 'Media'
  join public.department_roles r on r.department_id = d.id and r.name = w.role_name
 where not exists (
   select 1 from public.department_role_checklist_items i
    where i.role_id = r.id and i.label = w.label
 );

update public.department_role_checklist_items i
   set sort_order = w.sort_order,
       phase = w.phase
  from wanted w
  join public.departments d on d.name = 'Media'
  join public.department_roles r on r.department_id = d.id and r.name = w.role_name
 where i.role_id = r.id and i.label = w.label
   and (i.sort_order is distinct from w.sort_order or i.phase is distinct from w.phase);

drop table wanted;
