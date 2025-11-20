// PublicController: unauthenticated public endpoints for viewing user profiles by slug
// Aggregates user details, cover photo, services, payment plans, projects, clients, and testimonials

import mongoose from 'mongoose';
import User from '../models/User.js';
import PublicProfile from '../models/PublicProfile.js';
import Service from '../models/Service.js';
import Client from '../models/Client.js';
import Project from '../models/Project.js';
import Testimonial from '../models/Testimonial.js';
import Portfolio from '../models/Portfolio.js';

function parseObjectId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

const PublicController = {
  // GET /api/public/profile/:slug
  async profileBySlug(req, res) {
    try {
      const { slug } = req.params;
      const value = String(slug || '').trim().toLowerCase();
      if (!value) return res.status(400).json({ error: 'Invalid slug' });

      // Find user by profile.slug (only non-banned)
      const user = await User.findOne({ 'profile.slug': value, 'meta.status': { $ne: 'banned' } })
        .select([
          '_id',
          'registration.name',
          'registration.primaryRole',
          'registration.country',
          'registration.avatar',
          'profile.slug',
          'profile.shortBio',
          'profile.socialHandles',
          'profile.portfolio',
          'businessInformation',
        ])
        .lean();
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Cover photo and stats from PublicProfile, if available
      const pub = await PublicProfile.findOne({ user_id: user._id })
        .select(['cover_photo', 'stats', 'featured_clients', 'showcase_media', 'bio', 'published_services', 'published_projects'])
        .lean();

      // Services (active, optionally filtered by published selections)
      const publishedServiceIds = Array.isArray(pub?.published_services)
        ? pub.published_services.map((id) => parseObjectId(id)).filter(Boolean)
        : [];
      const servicesQuery = { user_id: user._id, status: 'active' };
      if (publishedServiceIds.length > 0) {
        Object.assign(servicesQuery, { _id: { $in: publishedServiceIds } });
      }
      const services = await Service.find(servicesQuery)
        .select(['_id', 'name', 'description', 'deliverables', 'pricing_plans'])
        .lean();

      // Clients added by owner
      const clients = await Client.find({ added_by: user._id, status: 'active' })
        .select(['_id', 'logo', 'business_name', 'industry', 'social_handles'])
        .lean();

      // Projects linked via owner clients (legacy display; will be hidden client-side if portfolio shown)
      const clientIds = clients.map((c) => c._id);
      const publishedProjectIds = Array.isArray(pub?.published_projects)
        ? pub.published_projects.map((id) => parseObjectId(id)).filter(Boolean)
        : [];
      let projects = [];
      if (publishedProjectIds.length > 0) {
        projects = await Project.find({ _id: { $in: publishedProjectIds } })
          .select([
            '_id', 'name', 'client', 'project_category', 'services', 'completion_date', 'end_date', 'project_budget', 'status', 'approval_status', 'target', 'testimonials'
          ])
          .lean();
      } else if (clientIds.length) {
        projects = await Project.find({ client: { $in: clientIds } })
          .select([
            '_id', 'name', 'client', 'project_category', 'services', 'completion_date', 'end_date', 'project_budget', 'status', 'approval_status', 'target', 'testimonials'
          ])
          .lean();
      }

      // Portfolio media selected for showcase on public profile
      const showcaseIds = Array.isArray(pub?.showcase_media)
        ? pub.showcase_media.map((id) => parseObjectId(id)).filter(Boolean)
        : [];
      const showcaseMedia = showcaseIds.length
        ? await Portfolio.find({ _id: { $in: showcaseIds }, status: 'active' })
            .select(['_id', 'type', 'media_url', 'thumbnail_url', 'title', 'description', 'uploaded_on'])
            .lean()
        : [];

      // Testimonials referenced by projects
      const testimonialIds = Array.from(
        new Set(
          projects.flatMap((p) => Array.isArray(p.testimonials) ? p.testimonials.map((t) => String(t)).filter(Boolean) : [])
        )
      ).map((s) => parseObjectId(s)).filter(Boolean);
      const testimonials = testimonialIds.length
        ? await Testimonial.find({ _id: { $in: testimonialIds }, status: 'active' })
            .select(['_id', 'testimonials', 'rating', 'given_on'])
            .lean()
        : [];

      // Compose response
      const payload = {
        user: {
          _id: user._id,
          name: user.registration?.name || '',
          primaryRole: user.registration?.primaryRole || '',
          country: user.registration?.country || '',
          avatar: user.registration?.avatar || '',
          slug: user.profile?.slug || value,
          shortBio: user.profile?.shortBio || pub?.bio || '',
          socialHandles: Array.isArray(user.profile?.socialHandles) ? user.profile.socialHandles : [],
          portfolio: Array.isArray(user.profile?.portfolio) ? user.profile.portfolio : [],
          businessInformation: user.businessInformation || {},
        },
        coverPhoto: pub?.cover_photo || '',
        stats: Array.isArray(pub?.stats) ? pub.stats : [],
        featuredClients: Array.isArray(pub?.featured_clients) ? pub.featured_clients : [],
        showcaseMedia,
        services,
        clients,
        projects,
        testimonials,
      };

      return res.json(payload);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
};

export default PublicController;