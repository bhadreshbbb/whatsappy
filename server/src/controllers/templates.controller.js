import { getDb } from '../services/database.js';

export const templatesController = {
  async getTemplates(req, res, next) {
    try {
      const db = getDb();
      const { category, language } = req.query;
      let results = db.message_templates.filter(t => t.channel_id === (req.headers['x-channel-id'] || ''));
      
      if (category) results = results.filter(t => t.category === category);
      if (language) results = results.filter(t => t.language === language);
      
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      res.json(results);
    } catch (error) {
      next(error);
    }
  },

  async getTemplate(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const result = db.message_templates.find(t => t.id == id);
      if (!result) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async createTemplate(req, res, next) {
    try {
      const db = getDb();
      const {
        name, category, language, use_visitor_lang,
        header_type, header_text, header_image_url,
        body_text, footer_text,
        buttons, carousel_cards, poll_options,
        flow_name, personalize_image,
        components, preview
      } = req.body;
      const id = (db.message_templates.length || 0) + 1;

      const newTemplate = {
        id,
        channel_id: req.headers['x-channel-id'] || '',
        name,
        category: category || 'custom',
        language: language || 'en',
        use_visitor_lang: use_visitor_lang || false,
        header_type: header_type || 'none',
        header_text: header_text || '',
        header_image_url: header_image_url || '',
        body_text: body_text || '',
        footer_text: footer_text || '',
        buttons: buttons || '[]',
        carousel_cards: carousel_cards || '[]',
        poll_options: poll_options || '[]',
        flow_name: flow_name || '',
        personalize_image: personalize_image || false,
        is_active: 1,
        created_at: new Date().toISOString()
      };

      db.message_templates.push(newTemplate);
      db.save();
      res.status(201).json(newTemplate);
    } catch (error) {
      next(error);
    }
  },

  async updateTemplate(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const idx = db.message_templates.findIndex(t => t.id == id);
      if (idx < 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      const existing = db.message_templates[idx];
      const {
        name, category, language, use_visitor_lang,
        header_type, header_text, header_image_url,
        body_text, footer_text,
        buttons, carousel_cards, poll_options,
        flow_name, personalize_image,
      } = req.body;

      db.message_templates[idx] = {
        ...existing,
        name: name ?? existing.name,
        category: category ?? existing.category,
        language: language ?? existing.language,
        use_visitor_lang: use_visitor_lang ?? existing.use_visitor_lang,
        header_type: header_type ?? existing.header_type,
        header_text: header_text ?? existing.header_text,
        header_image_url: header_image_url ?? existing.header_image_url,
        body_text: body_text ?? existing.body_text,
        footer_text: footer_text ?? existing.footer_text,
        buttons: buttons ?? existing.buttons,
        carousel_cards: carousel_cards ?? existing.carousel_cards,
        poll_options: poll_options ?? existing.poll_options,
        flow_name: flow_name ?? existing.flow_name,
        personalize_image: personalize_image ?? existing.personalize_image,
        updated_at: new Date().toISOString()
      };

      db.save();
      res.json(db.message_templates[idx]);
    } catch (error) {
      next(error);
    }
  },

  async deleteTemplate(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const idx = db.message_templates.findIndex(t => t.id == id);
      if (idx < 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      db.message_templates.splice(idx, 1);
      db.save();
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};

function extractVariables(components) {
  const variables = [];
  const regex = /\{\{(\w+)\}\}/g;
  for (const component of components || []) {
    if (component.text) {
      let match;
      while ((match = regex.exec(component.text)) !== null) {
        if (!variables.includes(match[1])) {
          variables.push(match[1]);
        }
      }
    }
  }
  return variables;
}
